import {test} from 'node:test';
import assert from 'node:assert/strict';
import {percentageWeight,toLbs,findClassRecord,prepareBatchRecords} from '../web/record-tools.js';

const alice={id:'alice',name:'같은이름',status:'approved'},bob={id:'bob',name:'같은이름',status:'approved'};
const context={date:'2026-10-30',program:'WOD',session:'09:30',section:'S1',unit:'lbs',sectionData:{record:true,kind:'1RM',movement:'Front Squat',movements:['Front Squat']}};
const batch=overrides=>prepareBatchRecords({rows:[{member:alice,value:'200',note:''}],context,records:[],today:'2026-10-30',idFactory:()=> 'new-record',...overrides});

test('percentage calculator preserves canonical weight across lbs and kg',()=>{
  assert.equal(percentageWeight(200,80),160);
  assert.ok(Math.abs(percentageWeight(toLbs(100,'kg'),75,'kg')-75)<1e-9);
  for(const n of [0,-1,NaN,Infinity,151])assert.equal(percentageWeight(200,n),null);
  assert.equal(percentageWeight(0,80),null);
});
test('batch validation is atomic and blank rows do not erase results',()=>{
  const result=batch({rows:[{member:alice,value:'200',note:''},{member:bob,value:'NaN',note:''}]});
  assert.equal(result.changes.length,0);assert.equal(result.errors.length,1);
  assert.deepEqual(batch({rows:[{member:alice,value:'',note:''}]}).changes,[]);
  assert.ok(batch({rows:[{member:{...alice,status:'pending'},value:'100'}]}).errors.length);
  assert.ok(batch({context:{...context,date:'2026-10-31'}}).errors.length);
  assert.ok(batch({context:{...context,date:'2026-02-30'}}).errors.length);
  assert.ok(batch({rows:[{member:alice,value:'100'},{member:alice,value:'110'}]}).errors.length);
});
test('batch results remain scoped to member ID, class time, and section',()=>{
  const old=batch().changes[0],records=[old];
  assert.equal(findClassRecord(records,bob,context),undefined);
  assert.equal(findClassRecord(records,alice,{...context,session:'19:10'}),undefined);
  assert.equal(findClassRecord(records,alice,{...context,section:'S2'}),undefined);
  assert.equal(findClassRecord(records,alice,context).id,'new-record');
  assert.equal(batch({records,rows:[{member:alice,value:'225',note:''}]}).changes.length,0);
  assert.match(batch({records,rows:[{member:alice,value:'225',note:''}]}).errors.join(),/수정 허용/);
  const changed=batch({records,overwrite:true,rows:[{member:alice,value:'225',note:'PR'}]}).changes[0];
  assert.equal(changed.id,old.id);assert.equal(changed.lbs,225);assert.equal(changed.note,'PR');
  assert.equal(batch({records}).changes.length,0);
  assert.equal(batch({records,context:{...context,unit:'kg'},rows:[{member:alice,value:'90.7',canonicalLbs:200,note:''}]}).changes.length,0);
  assert.equal(batch({context:{...context,unit:'kg'},rows:[{member:alice,value:'100'}]}).changes[0].lbs,toLbs(100,'kg'));
});
test('time records reject invalid seconds and numeric reps accept zero',()=>{
  const time={...context,sectionData:{record:true,kind:'시간'}};
  assert.ok(batch({context:time,rows:[{member:alice,value:'9:75'}]}).errors.length);
  assert.equal(batch({context:time,rows:[{member:alice,value:'09:35'}]}).changes[0].value,'09:35');
  assert.equal(batch({context:{...context,sectionData:{record:true,kind:'횟수'}},rows:[{member:alice,value:'0'}]}).changes[0].value,'0');
});
