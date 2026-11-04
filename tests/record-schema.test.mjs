import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRecordResult,recordPolicy,canonicalRecordPayload,legacyResult} from '../web/record-schema.js';
import {sectionRanking} from '../web/section-ranking.js';
import {validateWorkouts} from '../web/core.js';
import {prepareBatchRecords} from '../web/record-tools.js';
const context={date:'2026-11-02',program:'WOD',section:'S1'},section=kind=>({kind,record:true}),result=(s,r)=>normalizeRecordResult(s,{condition:'rx',...r}),row=(id,s,r)=>({...context,memberId:id,name:id,id,kind:s.kind,rank:true,...result(s,r)});
const ranked=(records,s,c='rx')=>sectionRanking(records,{...context,kind:s.kind,sectionData:s,condition:c});
test('timecap rankings put finishers first then faster times; capped rounds compare lexicographically',()=>{
 const s={...section('시간'),recordPolicy:{capUnit:'라운드 + 횟수'}};
 const rows=[row('cap-low',s,{status:'capped',progress:3,extra:8}),row('slow',s,{status:'completed',seconds:900}),row('fast',s,{status:'completed',seconds:600}),row('cap-high',s,{status:'capped',progress:4,extra:0}),row('cap-tie',s,{status:'capped',progress:4,extra:0})];
 assert.deepEqual(ranked(rows,s).map(x=>[x.record.id,x.rank]),[['fast',1],['slow',2],['cap-high',3],['cap-tie',3],['cap-low',5]]);
});
test('RX, scaled and legacy unclassified records cannot compete with one another',()=>{
 const s=section('횟수'),rx=row('rx',s,{amount:8}),scaled=row('scaled',s,{amount:100,condition:'scaled'}),legacy={...context,id:'legacy',memberId:'legacy',kind:s.kind,value:'1000'};
 assert.deepEqual(ranked([rx,scaled,legacy],s).map(x=>x.record.id),['rx']);assert.deepEqual(ranked([rx,scaled,legacy],s,'scaled').map(x=>x.record.id),['scaled']);assert.deepEqual(ranked([rx,scaled,legacy],s,'unspecified').map(x=>x.record.id),['legacy']);
 assert.throws(()=>canonicalRecordPayload(s,{result:{condition:'unspecified',amount:5}},null));
});
test('complex result text is never interpreted as a sum; operators can specify one independent metric',()=>{
 const raw='2R+20 / 2R+30 / -20',s=section('세트별 횟수·칼로리');assert.equal(recordPolicy(s).ranking,'none');assert.deepEqual(ranked([row('a',s,{details:raw})],s),[]);
 const metric={...s,recordPolicy:{ranking:'metric',metricLabel:'총 횟수',metricOrder:'desc'}};
 const a=row('a',metric,{details:raw,rankingValue:25}),b=row('b',metric,{details:'어떤 복합 결과',rankingValue:30});assert.equal(a.value,raw);assert.deepEqual(ranked([a,b],metric).map(x=>x.record.id),['b','a']);
 assert.throws(()=>result(metric,{details:raw}));assert.deepEqual(ranked([a],{...metric,recordPolicy:{...metric.recordPolicy,metricLabel:'최고 횟수'}}),[]);
});
test('small-first operator metrics and competition ties are explicit, while hidden ranking is respected',()=>{
 const s={...section('자유 기록'),recordPolicy:{ranking:'metric',metricLabel:'페널티',metricOrder:'asc'}},rows=[row('a',s,{details:'a',rankingValue:0}),row('b',s,{details:'b',rankingValue:10}),{...row('c',s,{details:'c',rankingValue:0}),rank:false}];assert.deepEqual(ranked(rows,s).map(x=>x.record.id),['a','b']);assert.deepEqual(ranked(rows,{...s,recordPolicy:{ranking:'none'}}),[]);
});
test('typed formats enforce integer rounds/counts, completed status, clock bounds and positive weight',()=>{
 for(const [s,r]of [[section('횟수'),{amount:-1}],[section('칼로리'),{amount:1.5}],[section('라운드 + 횟수'),{rounds:2,extra:''}],[section('시간'),{status:'completed',seconds:0}],[section('시간'),{status:'capped',progress:''}],[section('완료 여부'),{completed:'yes'}],[section('1RM'),{lbs:true}],[section('자유 기록'),{details:'a'.repeat(1001)}]])assert.throws(()=>result(s,r));
 assert.equal(result(section('완료 여부'),{completed:false}).value,'미완료');assert.equal(result(section('시간'),{status:'completed',seconds:95}).value,'01:35');assert.equal(result(section('라운드 + 횟수'),{rounds:0,extra:0}).value,'0R + 0');
});
test('old free text remains unchanged on note edits and never gains fabricated typed results',()=>{
 const s=section('라운드 + 횟수'),old={kind:s.kind,value:'2R+20/2R+30/-20'};assert.equal(legacyResult(old,s),null);assert.deepEqual(canonicalRecordPayload(s,{value:old.value},old),{value:old.value});assert.equal(old.result,undefined);
 assert.throws(()=>canonicalRecordPayload(section('횟수'),{lbs:200}));assert.throws(()=>canonicalRecordPayload(section('1RM'),{value:'200'}));
});
test('workout validation retains canonical operator policy and rejects invalid metric policy',()=>{
 const w={date:'2026-11-02',program:'WOD',sections:[{...section('자유 기록'),text:'복합 운동',title:'S1',recordPolicy:{ranking:'metric',metricLabel:'총 횟수',metricOrder:'desc'}}]};const ok=validateWorkouts([w]);assert.deepEqual(ok.errors,[]);assert.equal(ok.workouts[0].sections[0].recordPolicy.metricLabel,'총 횟수');w.sections[0].recordPolicy.metricLabel='';assert.ok(validateWorkouts([w]).errors.length);
});
test('batch typed rows validate atomically and blank rows leave existing records intact',()=>{
 const s=section('시간'),member={id:'m',name:'회원',status:'approved'},c={...context,unit:'lbs',sectionData:s};
 const args={context:c,today:context.date,idFactory:()=> 'id'};
 let b=prepareBatchRecords({...args,rows:[{member,value:'typed',resultInput:{condition:'rx',status:'capped',progress:20}}]});assert.deepEqual(b.errors,[]);assert.equal(b.changes[0].result.progress,20);
 b=prepareBatchRecords({...args,rows:[{member,value:'typed',resultInput:{condition:'rx',status:'completed',seconds:300}},{member:{...member,id:'bad'},value:'typed',resultInput:{condition:'rx',status:'capped',progress:-1}}]});assert.equal(b.changes.length,0);assert.equal(b.errors.length,1);
 assert.deepEqual(prepareBatchRecords({...args,rows:[{member,value:''}],records:[{...context,memberId:'m',value:'09:30'}]}).changes,[]);
});
test('legacy completed times and reclassified timecaps use the same score dimensions',()=>{const s=section('시간'),legacy={...context,memberId:'legacy',id:'legacy',kind:s.kind,value:'15:00'},capped=row('cap',s,{condition:'unspecified',status:'capped',progress:1000});assert.deepEqual(ranked([capped,legacy],s,'unspecified').map(x=>x.record.id),['legacy','cap']);});
