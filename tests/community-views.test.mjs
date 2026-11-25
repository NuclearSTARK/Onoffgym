import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityViewsService} from '../supabase/functions/onoff-api/community-views-service.js';
import {communityViewCount,communityViewLabel,storedCommunityViewCount} from '../web/community-views.js';
const owner='10000000-0000-4000-8000-000000000001',reader='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',id='20000000-0000-4000-8000-000000000001';
function fixture(){
 const tables={gym_members:[{id:owner,disclosure_consent:true}],gym_posts:[{id,author_id:owner,category:'자유글'}],gym_notices:[{id,author_id:owner}],gym_memberships:[],gym_attendance:[]},reads={[owner]:{['post:'+id]:'legacy',['notice:'+id]:'legacy'},[other]:{['post:'+id]:'legacy'}},calls=[];
 const db={from(table){let rows=structuredClone(tables[table]||[]),single=false;const q={select(){return q},eq(k,v){rows=rows.filter(x=>x[k]===v);return q},maybeSingle(){single=true;return q},then(resolve,reject){return Promise.resolve({data:single?rows[0]||null:rows,error:null}).then(resolve,reject)}};return q;},rpc(name,p){calls.push({name,p});if(name==='onoff_commit'){reads[p.actor]??={};reads[p.actor][p.p.kind+':'+p.p.id]??='now';return Promise.resolve({data:{ok:true},error:null});}return Promise.resolve({data:Object.fromEntries([...(p.post_ids||[]).map(id=>'post:'+id),...(p.notice_ids||[]).map(id=>'notice:'+id)].map(key=>[key,storedCommunityViewCount(key,owner,reads)])),error:null});}};
 return {tables,reads,calls,service:createCommunityViewsService(db,{now:()=>new Date('2026-11-25T01:00:00Z')})};
}
const member={id:reader,role:'member',status:'approved'};
test('first read counts once across repeated requests/devices; author and notice/post namespaces stay separate',async()=>{
 const f=fixture();for(let i=0;i<3;i++)assert.equal((await f.service.read(member,{id,kind:'post'})).viewCount,2);
 assert.equal((await f.service.read(member,{id,kind:'notice'})).viewCount,1);
 const before=f.calls.filter(c=>c.name==='onoff_commit').length;
 assert.equal((await f.service.read({...member,id:owner},{id,kind:'post'})).viewCount,2);
 assert.equal(f.calls.filter(c=>c.name==='onoff_commit').length,before);
 assert.ok(f.calls.every(c=>c.p.actor===reader||c.p.actor===owner));
});
test('unapproved, unavailable, expired and undisclosed posts cannot create views or reveal counts',async()=>{
 const f=fixture();for(const status of ['pending','suspended'])await assert.rejects(f.service.read({...member,status},{id,kind:'post'}),e=>e.status===403);
 await assert.rejects(f.service.read({...member,delete_requested_at:'now'},{id,kind:'post'}),e=>e.status===403);
 f.tables.gym_members[0].disclosure_consent=false;await assert.rejects(f.service.read(member,{id,kind:'post'}),e=>e.status===404);
 f.tables.gym_members[0].disclosure_consent=true;
 f.tables.gym_posts[0]={id,author_id:owner,category:'운동 번개',starts_at:'2026-11-23T00:00:00Z'};
 await assert.rejects(f.service.read(member,{id,kind:'post'}),e=>e.status===404);
 f.tables.gym_posts=[];await assert.rejects(f.service.read(member,{id,kind:'post'}),e=>e.status===404);assert.equal(f.calls.length,0);
});
test('read counting follows membership access, including the usable last-visit day',async()=>{
 const f=fixture(),pass={id:'pass',user_id:reader,kind:'visits',remaining_visits:0,total_visits:10,start_date:'2026-01-01',end_date:'2026-12-31'};
 f.tables.gym_memberships=[pass];await assert.rejects(f.service.read(member,{id,kind:'post'}),e=>e.status===403);assert.equal(f.calls.length,0);
 f.tables.gym_attendance=[{user_id:reader,date:'2026-11-25',membership_id:'pass'}];assert.equal((await f.service.read(member,{id,kind:'post'})).viewCount,2);
 pass.paused_at='2026-11-24';await assert.rejects(f.service.read(member,{id,kind:'post'}),e=>e.status===403);
});
test('untrusted counters cannot become markup or negative counts and local legacy read maps use account identity',()=>{
 for(const value of [NaN,Infinity,-1,1.5,'<img>',null,undefined])assert.equal(communityViewCount(value),0);
 assert.equal(communityViewLabel(1234),'조회 1,234');assert.equal(storedCommunityViewCount('post:x',owner,{[owner]:{'post:x':'yes'},[reader]:{'post:x':'yes'},[other]:{'notice:x':'yes'}}),1);
});
