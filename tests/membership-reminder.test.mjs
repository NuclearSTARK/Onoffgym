import {test} from 'node:test';
import assert from 'node:assert/strict';
import {membershipReminderEligible,membershipReminderPayload} from '../web/membership-reminder.js';
const member={id:'u',status:'approved'},pass={id:'p',user_id:'u',kind:'period',start_date:'2026-10-01',end_date:'2026-11-15',paused_at:null},payload={membershipId:'p',endDate:'2026-11-15'},at=new Date('2026-11-12T00:00:00Z');
test('expiry is exactly three calendar days before the end date, at/after 09:00 Korea time',()=>{
 assert.equal(membershipReminderEligible(member,pass,payload,at),true);
 for(const time of ['2026-11-11T23:59:59Z','2026-11-11T00:00:00Z','2026-11-13T00:00:00Z'])assert.equal(membershipReminderEligible(member,pass,payload,new Date(time)),false);
 assert.equal(membershipReminderEligible(member,pass,payload,new Date('2026-11-12T14:59:59Z')),true);
 assert.equal(membershipReminderEligible(member,pass,payload,new Date('2026-11-12T15:00:00Z')),false);
});
test('pending, deleted, paused, unstarted, exhausted, replaced and extended passes cannot receive a queued reminder',()=>{
 for(const m of [{...member,status:'pending'},{...member,status:'suspended'},{...member,delete_requested_at:'2026-11-11T00:00:00Z'}])assert.equal(membershipReminderEligible(m,pass,payload,at),false);
 for(const p of [null,{...pass,id:'new-pass'},{...pass,user_id:'another'},{...pass,end_date:'2027-01-15'},{...pass,end_date:null},{...pass,start_date:'2026-11-13'},{...pass,paused_at:'2026-11-11'},{...pass,kind:'visits',remaining_visits:0}])assert.equal(membershipReminderEligible(member,p,payload,at),false);
 assert.equal(membershipReminderEligible(member,{...pass,kind:'visits',remaining_visits:1},payload,at),true);
});
test('membership notice exposes no member name/ID and opens only the signed-in member wallet',()=>{const out=membershipReminderPayload(pass);assert.equal(out.url,'/Onoffgym/?membership=expiry#settings');assert.equal(out.title,'회원권 만료 3일 전');assert(out.body.includes('2026-11-15'));assert.equal(out.tag,'membership-expiry:p:2026-11-15');});
