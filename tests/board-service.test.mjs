import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBoardService,personalBoardRecords} from '../supabase/functions/onoff-api/board-service.js';
const admin={id:'10000000-0000-4000-8000-000000000001',status:'approved',role:'admin'},photoId='20000000-0000-4000-8000-000000000001';
function fixture({apiKey='test-only-key',saved=null,providerStatus=200}={}){
 const calls=[],writes=[],tables={gym_settings:[],gym_photos:[{id:photoId,kind:'daily',active:true,uploaded:true,date:'2026-11-10',program:'WOD',path:'private-owned.jpg'}],gym_workouts:[{date:'2026-11-10',body:{program:'WOD',sections:[{number:1,record:true,kind:'시간',text:'Team of 2',title:'S1'}]}}],gym_members:[{id:admin.id,status:'approved',name:'운영자'}],gym_board_aliases:[],gym_board_imports:saved?[saved]:[]};
 const db={from(table){let rows=structuredClone(tables[table]||[]),one=false;const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},is(k,v){rows=rows.filter(r=>r[k]==null);return q},order(){return q},limit(){return q},maybeSingle(){one=true;return q},then(resolve,reject){return Promise.resolve({data:one?rows[0]||null:rows}).then(resolve,reject)}};return q;},rpc(name,args){writes.push({name,args});return Promise.resolve({data:name==='onoff_board_ai_claim'?true:{...args.p,revision:1}})},storage:{from(){return {download(path){assert.equal(path,'private-owned.jpg');return Promise.resolve({data:new Blob([new Uint8Array([255,216,255,217])])})}}}}};
 const service=createBoardService(db,{apiKey,visionFetch:async(url,request)=>{calls.push({url,body:JSON.parse(request.body)});return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({rows:[{sectionKey:'WOD:1',program:'WOD',names:['형대','미가입'],value:'08:41',condition:'unspecified',note:''}]})}]}]}),{status:providerStatus})}});
 return {service,calls,writes,tables};
}
test('vision reads only an authorized owned photo, sends no roster IDs, and persists one unreviewed team draft',async()=>{
 const f=fixture(),r=await f.service.route(admin,'/api/board/analyze',{photoId});assert.equal(r.saved.rows.length,1);assert.equal(r.saved.rows[0].participants.length,2);assert.equal(r.saved.rows[0].reviewed,false);assert.equal(r.saved.rows[0].participants[0].memberId,null);assert.equal(f.calls[0].url,'https://api.openai.com/v1/responses');assert.equal(f.calls[0].body.store,false);assert(!JSON.stringify(f.calls[0].body).includes(admin.id));assert.equal(f.writes.at(-1).args.p.status,'draft');
});
test('existing edits, missing credentials, foreign photo IDs and nonstaff requests never call AI',async()=>{
 for(const opts of [{saved:{photo_id:photoId,revision:1}},{apiKey:''}]){const f=fixture(opts);await assert.rejects(f.service.route(admin,'/api/board/analyze',{photoId}));assert.equal(f.calls.length,0);}
 const f=fixture();await assert.rejects(f.service.route({...admin,role:'member'},'/api/board/open',{photoId}),{status:403});await assert.rejects(f.service.route(admin,'/api/board/analyze',{photoId:'30000000-0000-4000-8000-000000000001'}),{status:404});assert.equal(f.calls.length,0);
});
test('provider failures do not create records and malformed/unreviewed rows cannot publish',async()=>{
 const f=fixture({providerStatus:429});await assert.rejects(f.service.route(admin,'/api/board/analyze',{photoId}),{status:503});assert(!f.writes.some(w=>w.name==='onoff_board_commit'));
 await assert.rejects(f.service.route(admin,'/api/board/save',{photoId,revision:0,status:'published',rows:[{participants:[{name:'형대'}],value:'08:41',sectionKey:'WOD:1',reviewed:false}]}),{status:400});
});

test('personal photo records retain a single team result and redact unlinked or nonconsenting teammates',()=>{
 const row={id:'r1',value:'08:41',participants:[{name:'칠판별칭',memberId:admin.id},{name:'미가입실명',memberId:null},{name:'비공개회원',memberId:'private-id'}]};
 const imports=[{photo_id:photoId,gym_photos:{date:'2026-11-10',session:''},rows:[row,{...row,id:'excluded',excluded:true},{...row,id:'other',participants:[{name:'다른회원',memberId:'other'}]}]}];
 const result=personalBoardRecords(imports,{...admin,name:'본인실명'},[{id:'private-id',disclosure_consent:false,name:'비공개회원'}]);assert.equal(result.length,1);assert.deepEqual(result[0].participants.map(p=>p.name),['본인실명','팀원','팀원']);assert(!JSON.stringify(result).includes('private-id'));
});

test('personal board history serializes a JSONB array with the real Supabase client before bootstrap',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const seen=[];
 const db=createClient('https://board-history.invalid','test-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url)=>{
  const u=new URL(url);seen.push(u);return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
 }}});
 const data=await createBoardService(db).personal(admin,[]);assert.deepEqual(data,[]);
 const url=seen.find(u=>u.pathname.endsWith('/gym_board_imports'));assert(url);
 const predicate=url.searchParams.get('rows');assert(predicate.startsWith('cs.['));
 assert.deepEqual(JSON.parse(predicate.slice(3)),[{participants:[{memberId:admin.id}]}]);
 assert.equal(url.searchParams.get('status'),'eq.published');assert.equal(url.searchParams.get('gym_photos.active'),'eq.true');
});
