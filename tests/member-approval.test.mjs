import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isRejectedMember,memberApprovalState,memberStatusLabel} from '../web/member-approval.js';

test('never-approved rejections and formerly approved suspensions are separate',()=>{
 const rejected={status:'suspended',approved_at:null,rejected_at:'2026-11-10T09:00:00Z'};
 assert.equal(isRejectedMember(rejected),true);
 assert.equal(memberApprovalState(rejected),'rejected');assert.equal(memberStatusLabel(rejected),'승인 거절');
 const suspended={...rejected,approved_at:'2026-11-01T00:00:00Z'};
 assert.equal(isRejectedMember(suspended),false);assert.equal(memberApprovalState(suspended),'suspended');assert.equal(memberStatusLabel(suspended),'이용 중지');
 assert.equal(isRejectedMember({...rejected,delete_requested_at:'2026-11-10T10:00:00Z'}),false);
 assert.equal(isRejectedMember({...rejected,status:'pending'}),false);
 assert.equal(memberStatusLabel({...rejected,status:'pending'}),'승인 대기');
 assert.equal(memberStatusLabel({status:'approved'}),'승인 완료');
});
