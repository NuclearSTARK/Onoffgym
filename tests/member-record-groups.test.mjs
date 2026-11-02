import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupMemberRecords} from '../web/member-record-groups.js';
test('groups sections by identity, keeps duplicate names separate and sorts S1 before S2',()=>{const input=[{id:'a2',memberId:'a',name:'동명이인',section:'S2',rank:false},{id:'b1',memberId:'b',name:'동명이인',section:'S1',rank:true},{id:'a1',memberId:'a',name:'동명이인',section:'S1',rank:true}];const groups=groupMemberRecords(input);assert.equal(groups.length,2);assert.deepEqual(groups[0].records.map(r=>r.id),['a1','a2']);assert.equal(groups[0].records[1].rank,false);assert.equal(groups[1].records[0].id,'b1');assert.equal(input[0].id,'a2');});
