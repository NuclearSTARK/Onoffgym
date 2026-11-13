import test from 'node:test';
import assert from 'node:assert/strict';
import {improvedBests,newYearWelcomeDate,stampMarkup,createMemberEvents} from '../web/member-events.js';
import {programsForDate,programLabel,canonicalProgram} from '../web/course-programs.js';
import {validateWorkouts} from '../web/core.js';
test('Saturday is one Special Workout, preserving WOD keys, comments and section records',()=>{
 assert.deepEqual(programsForDate('2026-11-14'),['WOD']);assert.equal(programLabel('WOD','2026-11-14'),'Special Workout');assert.equal(programLabel('OPEN GYM','2026-11-14'),'OPEN GYM');assert.equal(programLabel('WOD','2026-11-13'),'WOD');
 const w={date:'2026-11-14',program:'Special Workout',sessions:['10:00'],sections:[{title:'Team of 3',text:'AMRAP 20',kind:'라운드 + 횟수',record:true}]};
 const v=validateWorkouts([w]);assert.deepEqual(v.errors,[]);assert.equal(v.workouts[0].program,'WOD');assert.equal(v.workouts[0].sections[0].title,'Team of 3');assert.ok(validateWorkouts([{...w,program:'B/T'}]).errors.some(e=>e.includes('Special Workout')));assert.equal(canonicalProgram('Special Workout','2026-11-13'),'SPECIAL WORKOUT');
});
test('2027 first-entry window and attendance stamp follow Korean midnight and year boundaries',()=>{
 for(const [d,expected]of [['2026-12-31T14:59:59Z',false],['2026-12-31T15:00:00Z',true],['2027-01-07T14:59:59Z',true],['2027-01-07T15:00:00Z',false],['2028-01-01',false]])assert.equal(newYearWelcomeDate(new Date(d)),expected);
 assert.equal(stampMarkup({firstWorkout2027:'2027-01-02'},new Date('2027-01-01T03:00Z')),'');assert.match(stampMarkup({firstWorkout2027:'2027-01-01'},new Date('2027-01-01T03:00Z')),/2027 첫 운동 완료/);assert.equal(stampMarkup({firstWorkout2027:null},new Date('2027-01-01')),'');
});
const base={owner:'owner',rm:[{id:'squat',label:'Squat',lbs:200}],named:[{id:'fran',label:'Fran',type:'time',seconds:300},{id:'cindy',label:'Cindy',type:'rounds',rounds:10,reps:5}]};
test('PR requires a previous own best and strict improvement, including time direction and round tie break',()=>{
 assert.deepEqual(improvedBests(null,base),[]);assert.deepEqual(improvedBests(base,base),[]);assert.deepEqual(improvedBests(base,{...base,owner:'other'}),[]);
 const next={...base,rm:[{...base.rm[0],lbs:205},{id:'new',lbs:100}],named:[{...base.named[0],seconds:299},{...base.named[1],reps:6}]};assert.equal(improvedBests(base,next).length,3);
 assert.deepEqual(improvedBests(base,{...base,rm:[{...base.rm[0],lbs:190}],named:[{...base.named[0],seconds:301},{...base.named[1],rounds:9,reps:100}]}),[]);
});
test('failed saves never refresh PR stats; event reads failing do not prevent record saving; no other-account stats leak',async()=>{
 const previous=globalThis.document;globalThis.document={querySelectorAll:()=>[],addEventListener(){}};
 let id='owner',approved=true,failRead=false,failWrite=false,reads=0,writes=0;
 const ui=createMemberEvents({context:()=>({id,approved,now:new Date('2026-11-14')}),raw:async(path)=>{if(path==='/api/member-milestones'){reads++;if(failRead)throw Error('offline');return {...base,owner:id};}writes++;if(failWrite)throw Error('denied');return {ok:true};}});
 try{await ui.read();failWrite=true;await assert.rejects(ui.request('/api/rms',{lbs:210}),/denied/);assert.equal(reads,2);assert.equal(writes,1);failWrite=false;failRead=true;assert.deepEqual(await ui.request('/api/rms',{lbs:215}),{ok:true});assert.equal(writes,2);approved=false;assert.equal(await ui.read(true),null);id='other';approved=true;failRead=false;assert.equal((await ui.read(true)).owner,'other');}finally{ui.destroy();globalThis.document=previous;}
});
