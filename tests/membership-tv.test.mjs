import {test} from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {database,addMember,identity,fixture} from './db.mjs';
import {periodEnd,changeMembership,membershipState} from '../web/membership.js';
async function setup(){const {db}=database();for(const m of [identity('member'),identity('other'),identity('coach','coach')])await addMember(db,m);const env={DB:db,ONOFF_OWNER_EMAIL:'owner@example.test',holidayFetch:async()=>{throw Error('offline')}};const now=new Date('2026-11-02T01:00:00Z');async function call(user,path,body,time=now,extra={}){const headers={...extra};if(user){headers['oai-authenticated-user-id']=user;headers['oai-authenticated-user-email']=user==='owner'?'owner@example.test':user+'@example.test'}if(body){headers.Origin='https://gym.test';headers['Content-Type']='application/json'}const r=await api(new Request('https://gym.test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env,time);return{status:r.status,data:await r.json(),headers:r.headers};}return{db,env,call,now};}
test('calendar-month passes, leap years and pause/resume preserve remaining days and visits',()=>{
 assert.equal(periodEnd('2026-11-10',1),'2026-12-09');assert.equal(periodEnd('2028-02-29',12),'2029-02-27');
 let p=changeMembership(null,{action:'register',kind:'period',months:3,startDate:'2026-11-01'},'2026-11-01');assert.equal(p.end_date,'2027-01-31');
 p=changeMembership(p,{action:'pause'},'2026-11-10');assert.equal(membershipState(p,'2026-11-15').active,false);
 p=changeMembership(p,{action:'resume'},'2026-11-20');assert.equal(p.end_date,'2027-02-10');
 const v=changeMembership(null,{action:'register',kind:'visits',visits:10,startDate:'2026-11-01'},'2026-11-01');assert.equal(changeMembership(changeMembership(v,{action:'pause'},'2026-11-05'),{action:'resume'},'2026-11-12').remaining_visits,10);
 assert.throws(()=>changeMembership(v,{action:'adjust',remaining:20,reason:''},'2026-11-02'));
 assert.throws(()=>changeMembership(null,{action:'register',kind:'period',months:1,startDate:'2026-11-01',endDate:'bad'},'2026-11-01'));
});
test('visit passes debit once per Korean day and the last visit stays usable that day',async()=>{
 const {call}=await setup();assert.equal((await call('coach','/api/membership',{id:'member',action:'register',kind:'visits',visits:2,startDate:'2026-11-02'})).status,403);
 await call('owner','/api/membership',{id:'member',action:'register',kind:'visits',visits:2,startDate:'2026-11-02'});
 for(let n=0;n<4;n++)assert.equal((await call('member','/api/attendance',{})).status,200);
 assert.equal((await call('member','/api/bootstrap')).data.membership.remaining_visits,1);
 const next=new Date('2026-11-03T01:00:00Z');await call('member','/api/attendance',{},next);
 let boot=(await call('member','/api/bootstrap',undefined,next)).data;assert.equal(boot.membership.remaining_visits,0);assert.equal(boot.membershipState.active,true);
 assert.equal((await call('member','/api/attendance',{},next)).status,200);
 assert.equal((await call('member','/api/attendance',{},new Date('2026-11-04T01:00:00Z'))).status,403);
 await call('owner','/api/attendance/cancel',{id:'member',date:'2026-11-03',reason:'출석 입력 실수'},next);await call('owner','/api/attendance/cancel',{id:'member',date:'2026-11-03',reason:'중복 취소'},next);
 assert.equal((await call('member','/api/bootstrap',undefined,next)).data.membership.remaining_visits,1);
});
test('expired or paused passes hide workouts; old attendance cannot refund a new pass',async()=>{
 const {call}=await setup();await call('owner','/api/workouts',{workouts:[fixture('2026-11-02')]});
 await call('owner','/api/membership',{id:'member',action:'register',kind:'visits',visits:10,startDate:'2026-11-02'});await call('member','/api/attendance',{});
 await call('owner','/api/membership',{id:'member',action:'pause'});
 assert.deepEqual((await call('member','/api/bootstrap')).data.workouts,{});assert.equal((await call('member','/api/attendance',{},new Date('2026-11-03T01:00:00Z'))).status,403);
 await call('owner','/api/membership',{id:'member',action:'register',kind:'visits',visits:20,startDate:'2026-11-02'});
 await call('owner','/api/attendance/cancel',{id:'member',date:'2026-11-02',reason:'이전 회원권의 출석 취소'});
 assert.equal((await call('member','/api/bootstrap')).data.membership.remaining_visits,20);
 await call('owner','/api/membership',{id:'member',action:'adjust',endDate:'2026-11-02',remaining:20,reason:'유효기간 지정'});
 assert.deepEqual((await call('member','/api/bootstrap',undefined,new Date('2026-11-03T01:00:00Z'))).data.workouts,{});
});
test('staff-only distinguishing notes do not appear in ordinary member bootstrap',async()=>{
 const {call}=await setup();assert.equal((await call('coach','/api/member-note',{id:'member',note:'오전 방문'})).status,403);
 await call('owner','/api/member-note',{id:'member',note:'오전 방문'});
 assert.equal((await call('coach','/api/bootstrap')).data.members.find(m=>m.id==='member').note,'오전 방문');
 assert.equal(JSON.stringify((await call('member','/api/bootstrap')).data).includes('오전 방문'),false);
});
test('TV password sessions expose only published workouts for today, without member authentication',async()=>{
 const {call,db,now}=await setup();await call('owner','/api/workouts',{workouts:[fixture('2026-11-02'),fixture('2026-11-02','B/T'),fixture('2026-11-03')]});
 assert.equal((await call('coach','/api/tv/admin',{password:'123456',theme:'mint',unit:'lbs',pageSeconds:20})).status,403);
 assert.equal((await call('owner','/api/tv/admin',{password:'123456',theme:'mint',unit:'lbs',pageSeconds:20})).status,200);
 const stored=await db.prepare('SELECT value FROM gym_settings WHERE key=?').bind('tvPassword').first();assert.equal(stored.value.includes('123456'),false);
 assert.equal((await call('','/api/tv/bootstrap')).status,401);
 const login=await call('','/api/tv/login',{password:'123456'});assert.equal(login.status,200);assert.match(login.headers.get('Set-Cookie'),/HttpOnly/);assert.match(login.headers.get('Set-Cookie'),/Secure/);
 const cookie=login.headers.get('Set-Cookie').split(';')[0];const tv=await call('','/api/tv/bootstrap?date=2026-11-03',undefined,now,{Cookie:cookie});assert.equal(tv.status,200);assert.equal(tv.data.workouts.length,2);assert.ok(tv.data.workouts.every(w=>w.date==='2026-11-02'));assert.equal(tv.data.members,undefined);assert.equal(tv.data.memberships,undefined);
 assert.equal((await call('','/api/bootstrap',undefined,now,{Cookie:cookie})).status,401);
 await call('owner','/api/tv/admin',{password:'new-password',theme:'orange',unit:'kg',pageSeconds:30});assert.equal((await call('','/api/tv/bootstrap',undefined,now,{Cookie:cookie})).status,401);
 for(let i=0;i<5;i++)assert.equal((await call('','/api/tv/login',{password:'wrong' },now,{'CF-Connecting-IP':'test-rate-limit'})).status,401);
 assert.equal((await call('','/api/tv/login',{password:'new-password'},now,{'CF-Connecting-IP':'test-rate-limit'})).status,429);
});
