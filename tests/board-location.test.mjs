import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distanceMetres,validateAttendanceLocation} from '../web/attendance-location.js';
import {boardSections,normalizeBoardRows,linkBoardAliases} from '../web/board-records.js';
const pos={latitude:35.3,longitude:129.2,accuracy:20,timestamp:1000000},config={enabled:true,latitude:35.3,longitude:129.2,radius:200};
test('GPS attendance requires a fresh precise fix and rejects outside, missing and malformed coordinates',()=>{
 assert.doesNotThrow(()=>validateAttendanceLocation(config,pos,1000000));
 assert(distanceMetres(pos,{...pos,latitude:35.301})>110);
 for(const p of [null,{...pos,latitude:36},{...pos,accuracy:101},{...pos,timestamp:0},{...pos,latitude:'35.3'},{...pos,latitude:Infinity},{...pos,longitude:181}])assert.throws(()=>validateAttendanceLocation(config,p,1000000));
 assert.doesNotThrow(()=>validateAttendanceLocation({enabled:false},null));
});
const members=[{id:'id1',name:'최형대',status:'approved'},{id:'id2',name:'김형대',status:'approved'}];
const sections=boardSections([{program:'WOD',sections:[{number:1,title:'Team of 2',text:'20 min',record:true,kind:'시간'}]},{program:'B/T',sections:[{number:1,title:'S1',text:'AMRAP',record:true,kind:'라운드 + 횟수'}]}]);
const row={id:'r1',sectionKey:'WOD:1',participants:[{name:'형대',memberId:'id1'},{name:'경수',memberId:null}],value:"8'41",reviewed:true};
test('one team row keeps linked and unregistered people, uses the class record mode, and does not invent Rx',()=>{
 const out=normalizeBoardRows([row],sections,members,{publish:true});assert.equal(out.length,1);assert.equal(out[0].teamSize,2);assert.equal(out[0].result.seconds,521);assert.equal(out[0].result.condition,'unspecified');assert.equal(out[0].participants[1].memberId,null);
 assert.throws(()=>normalizeBoardRows([{...row,participants:[row.participants[0]]}],sections,members,{publish:true}));
 assert.throws(()=>normalizeBoardRows([{...row,reviewed:false}],sections,members,{publish:true}));
 assert.throws(()=>normalizeBoardRows([{...row,sectionKey:'missing'}],sections,members,{publish:true}));
 assert.throws(()=>normalizeBoardRows([{...row,participants:[{name:'x',memberId:'suspended'}]}],sections,members));
});
test('uncertain raw results survive without fabricated scores and only confirmed aliases auto-link',()=>{
 const r={...row,value:'-8',note:'원본 확인 필요'};assert.equal(normalizeBoardRows([r],sections,members,{publish:true})[0].result,null);
 assert.equal(linkBoardAliases([row],[])[0].participants[0].memberId,null);
 assert.equal(linkBoardAliases([row],[{alias:'형대',member_id:'id2'}])[0].participants[0].memberId,'id2');
 const round=normalizeBoardRows([{...row,sectionKey:'B/T:1',participants:[{name:'현우'}],value:'3R + 12'}],sections,members,{publish:true})[0];assert.equal(round.result.rounds,3);assert.equal(round.result.extra,12);
});
