import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/onoff-api/server.js';

const ADMIN='10000000-0000-4000-8000-000000000001',MEMBER='10000000-0000-4000-8000-000000000002';
const fixture=({role='member',status='approved',anonymous=false,valid=true}={})=>{
 const writes=[],tables={gym_members:[{id:MEMBER,name:'테스트 회원',role,status},{id:ADMIN,name:'운영자',role:'admin',status:'approved'}],gym_settings:[{key:'releaseTime',value:'22:00'},{key:'revision',value:0},{key:'tvPassword',value:{salt:'private',hash:'private'}}],gym_member_notes:[{user_id:MEMBER,note:'운영자 비공개 메모'}],gym_records:[],gym_holiday_cache:[{key:'KR',updated_at:'2026-11-02T00:00:00Z',body:{dates:{},source:'fixture'}}],gym_workouts:[{key:'2026-11-02_WOD',date:'2026-11-02',program:'WOD',release_at:'2026-11-01T13:00:00Z',body:{date:'2026-11-02',program:'WOD',sections:[{title:'Front Squat',text:'5 reps',record:true,kind:'중량',movements:['Front Squat']}]}},{key:'2026-11-03_WOD',date:'2026-11-03',program:'WOD',release_at:'2026-11-02T13:00:00Z',body:{date:'2026-11-03',program:'WOD',sections:[{title:'비공개 미래 운동',text:'secret'}]}}]};
 const db={from(name){let data=structuredClone(tables[name]||[]),single=false;const q={select(){return q},eq(k,v){data=data.filter(x=>x[k]===v);return q},gt(k,v){data=data.filter(x=>x[k]>v);return q},lte(k,v){data=data.filter(x=>x[k]<=v);return q},or(){return q},order(){return q},limit(n){data=data.slice(0,n);return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve({data:single?data[0]||null:data,error:null}).then(resolve,reject)}};return q;},rpc(name,p){writes.push(p);return Promise.resolve({data:{ok:true},error:null})}};
 const handle=createHandler(db,{verifyUser:async()=>valid?{id:MEMBER,is_anonymous:anonymous,user_metadata:{role:'admin'}}:null,now:()=>new Date('2026-11-02T01:00:00Z')});
 async function request(path,{body,token='valid',method=body?'POST':'GET',origin='https://nuclearstark.github.io'}={}){const headers={Origin:origin};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';const res=await handle(new Request('https://project.supabase.co/functions/v1/onoff-api'+path,{method,headers,body:body?JSON.stringify(body):undefined}));return {status:res.status,value:await res.json(),headers:res.headers};}
 return {tables,writes,request};
};

test('Supabase API exposes no member data without a verified non-anonymous Auth session',async()=>{
 for(const options of [{},{valid:false},{anonymous:true}]){
  const f=fixture(options);const r=await f.request('/api/bootstrap',{token:options.valid===undefined&&!options.anonymous?null:'bad'});assert.equal(r.status,401);assert.equal(r.value.viewer,undefined);assert.equal(f.writes.length,0);
 }
});
test('account deletion never accepts an unauthenticated caller-selected identity',async()=>{const f=fixture();const r=await f.request('/api/account/delete',{body:{id:ADMIN,password:'guess',confirmed:true},token:null});assert.equal(r.status,401);assert.equal(f.writes.length,0);});

test('API rejects disallowed origins, unexpected methods and JSON role escalation',async()=>{
 const f=fixture();assert.equal((await f.request('/api/bootstrap',{origin:'https://evil.example'})).status,403);
 assert.equal((await f.request('/api/attendance')).status,405);
 assert.equal((await f.request('/api/members',{body:{id:ADMIN,role:'admin',status:'approved'}})).status,403);assert.equal(f.writes.length,0);
});
test('pending and suspended members get only their approval state, without workouts or shared records',async()=>{
 for(const status of ['pending','suspended']){const f=fixture({status}),r=await f.request('/api/bootstrap');assert.equal(r.status,200);assert.deepEqual(r.value.workouts,{});assert.deepEqual(r.value.members,[]);assert.equal(r.value.records,undefined);assert.equal((await f.request('/api/attendance',{body:{}})).status,403);}
});
test('member bootstrap filters future releases and omits operator notes and TV secrets',async()=>{
 const f=fixture(),r=await f.request('/api/bootstrap');assert.equal(r.status,200);assert.ok(r.value.workouts['2026-11-02_WOD']);assert.equal(r.value.workouts['2026-11-03_WOD'],undefined);assert.deepEqual(r.value.members,[]);assert.equal(r.value.tv,undefined);assert.ok(!JSON.stringify(r.value).includes('운영자 비공개 메모'));assert.ok(!JSON.stringify(r.value).includes('private'));
});
test('record mutations use verified member IDs and canonical workout metadata; batches validate fully before commit',async()=>{
 const f=fixture(),r={id:crypto.randomUUID(),memberId:MEMBER,date:'2026-11-02',program:'WOD',section:'S1',lbs:135,name:'다른 이름',kind:'1RM',writer:'admin',movement:'Back Squat'};
 assert.equal((await f.request('/api/records',{body:{records:[{...r,memberId:ADMIN}]}})).status,403);assert.equal(f.writes.length,0);
 assert.equal((await f.request('/api/records',{body:{records:[r]}})).status,200);const saved=f.writes[0].p.records[0];assert.equal(saved.kind,'중량');assert.equal(saved.writer,'member');assert.equal(saved.movement,'Front Squat');assert.equal(saved.name,undefined);
 const a=fixture({role:'admin'});assert.equal((await a.request('/api/records',{body:{records:[r,{...r,id:crypto.randomUUID(),lbs:-1}]}})).status,400);assert.equal(a.writes.length,0);
});
test('member cannot impersonate another 1RM owner or override a catalogue movement',async()=>{
 const f=fixture();assert.equal((await f.request('/api/rms',{body:{movementId:'front-squat',memberId:ADMIN,lbs:185,date:'2026-11-02'}})).status,200);assert.equal(f.writes[0].p.memberId,MEMBER);
 assert.equal((await f.request('/api/rms',{body:{movementId:'invented',lbs:185,date:'2026-11-02'}})).status,400);
});
test('revision heartbeat is small and TV PIN has no default on the shared backend',async()=>{
 const f=fixture(),r=await f.request('/api/revision');assert.equal(r.status,200);assert.ok(JSON.stringify(r.value).length<150);assert.equal(r.value.workouts,undefined);
 f.tables.gym_settings=f.tables.gym_settings.filter(x=>x.key!=='tvPassword');assert.equal((await f.request('/api/tv/login',{body:{password:'0000'},token:null})).status,503);
});
