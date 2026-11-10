import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memberEventTime} from '../web/member-history.js';

test('management history converts server UTC timestamps to Korean time',()=>{
 assert.equal(memberEventTime('2026-11-10T09:35:00+00:00'),'2026-11-10 18:35');
 assert.equal(memberEventTime('2026-11-10T09:34:15.123Z'),'2026-11-10 18:34');
 assert.equal(memberEventTime('2026-11-10T18:35:00+09:00'),'2026-11-10 18:35');
});

test('management history uses the Korean date across midnight and year boundaries',()=>{
 assert.equal(memberEventTime('2026-11-10T14:59:59Z'),'2026-11-10 23:59');
 assert.equal(memberEventTime('2026-11-10T15:00:00Z'),'2026-11-11 00:00');
 assert.equal(memberEventTime('2026-12-31T15:05:00Z'),'2027-01-01 00:05');
});

test('missing or invalid event times do not break the management history',()=>{
 for(const value of [null,undefined,'','invalid'])assert.equal(memberEventTime(value),'시간 정보 없음');
});
