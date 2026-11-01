import {test} from 'node:test';
import assert from 'node:assert/strict';
import {membershipCard} from '../web/membership-card.js';
const today='2026-11-02',base={kind:'period',start_date:'2026-11-01',end_date:'2026-11-30',months:1,paused_at:null};
test('membership cards derive all five designs from existing passes without changing them',()=>{
 for(const months of [1,3,6,12]){const pass={...base,months},before=JSON.stringify(pass),html=membershipCard(pass,{today,name:'회원'});assert.ok(html.includes('data-plan="month-'+months+'"'));assert.equal(JSON.stringify(pass),before);assert.ok(html.includes('2026-11-01'));assert.ok(html.includes('29<small>일 남음'));}
 const visits={kind:'visits',start_date:'2026-11-01',end_date:null,total_visits:20,remaining_visits:7};const html=membershipCard(visits,{today,name:'회원'});assert.ok(html.includes('data-plan="visits"'));assert.ok(html.includes('7<small>회 남음'));assert.ok(html.includes('기간 제한 없음'));
});
test('membership cards distinguish paused, expired, scheduled and unregistered states, including the last visit day',()=>{
 for(const [pass,status]of [[{...base,paused_at:'2026-11-01'},'paused'],[{...base,end_date:'2026-10-31'},'expired'],[{...base,start_date:'2026-11-03'},'scheduled'],[null,'unregistered']])assert.ok(membershipCard(pass,{today,name:'회원'}).includes('data-status="'+status+'"'));
 const last={kind:'visits',start_date:'2026-11-01',remaining_visits:0};assert.ok(membershipCard(last,{today,name:'회원',attendedToday:true}).includes('오늘 마지막 회차 이용 중'));assert.ok(membershipCard(last,{today,name:'회원'}).includes('data-status="expired"'));
 const html=membershipCard(base,{today,name:'<img src=x onerror=alert(1)>'});assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
});
