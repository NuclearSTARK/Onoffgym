import {test} from 'node:test';
import assert from 'node:assert/strict';
import {personalBoardRecords,readPhotoHistory} from '../supabase/functions/onoff-api/photo-history.js';
const admin={id:'10000000-0000-4000-8000-000000000001',status:'approved',role:'admin'},photoId='20000000-0000-4000-8000-000000000001';
test('personal photo records retain a single team result and redact unlinked or nonconsenting teammates',()=>{
 const row={id:'r1',value:'08:41',participants:[{name:'칠판별칭',memberId:admin.id},{name:'미가입실명',memberId:null},{name:'비공개회원',memberId:'private-id'}]};
 const imports=[{photo_id:photoId,gym_photos:{date:'2026-11-10',session:''},rows:[row,{...row,id:'excluded',excluded:true},{...row,id:'other',participants:[{name:'다른회원',memberId:'other'}]}]}];
 const result=personalBoardRecords(imports,{...admin,name:'본인실명'},[{id:'private-id',disclosure_consent:false,name:'비공개회원'}]);assert.equal(result.length,1);assert.deepEqual(result[0].participants.map(p=>p.name),['본인실명','팀원','팀원']);assert(!JSON.stringify(result).includes('private-id'));
});

test('personal board history serializes a JSONB array with the real Supabase client before bootstrap',async()=>{
 const {createClient}=await import('../web/assets/supabase-js-2.118.0.js');
 const seen=[];
 const db=createClient('https://board-history.invalid','test-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url)=>{
  const u=new URL(url);seen.push(u);return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
 }}});
 const data=await readPhotoHistory(db,admin,[]);assert.deepEqual(data,[]);
 const url=seen.find(u=>u.pathname.endsWith('/gym_board_imports'));assert(url);
 const predicate=url.searchParams.get('rows');assert(predicate.startsWith('cs.['));
 assert.deepEqual(JSON.parse(predicate.slice(3)),[{participants:[{memberId:admin.id}]}]);
 assert.equal(url.searchParams.get('status'),'eq.published');assert.equal(url.searchParams.get('gym_photos.active'),'eq.true');
});
