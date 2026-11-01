import {test} from 'node:test';import assert from 'node:assert/strict';
import {createWorkoutDrafts} from '../web/workout-drafts.js';
import {validateWorkouts} from '../web/core.js';
import {fixture} from './db.mjs';
test('unfinished classes persist separately by account, date and program and clear only their own draft',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},drafts=createWorkoutDrafts(storage);
 const value={sections:[{title:'',text:'작성 중',movements:['직접 입력']}],sessions:'10:00',overview:''};
 drafts.write('owner-a','2026-11-02','B/T',value);drafts.write('owner-a','2026-11-02','WOD',{...value,overview:'https://youtu.be/abcdefghijk'});
 assert.equal(drafts.read('owner-b','2026-11-02','B/T'),null);assert.equal(drafts.read('owner-a','2026-11-03','B/T'),null);
 assert.equal(drafts.read('owner-a','2026-11-02','B/T').sections[0].text,'작성 중');drafts.remove('owner-a','2026-11-02','B/T');assert.equal(drafts.read('owner-a','2026-11-02','B/T'),null);assert.ok(drafts.read('owner-a','2026-11-02','WOD'));
});
test('expired or corrupt drafts never replace a published class',()=>{let saved='bad json';let clock=0;const storage={getItem:()=>saved,setItem:(_,v)=>saved=v,removeItem:()=>saved=null},drafts=createWorkoutDrafts(storage,{now:()=>clock});assert.equal(drafts.read('a','2026-11-02','WOD'),null);drafts.write('a','2026-11-02','WOD',{sections:[{title:'draft'}]});clock=8*86400000;assert.equal(drafts.read('a','2026-11-02','WOD'),null);});
test('free-text and missing related movements do not block classes or fabricate a canonical 1RM movement',()=>{
 const w=fixture('2026-11-02');w.sections[0].movements=['Front Sqart'];let result=validateWorkouts([w]);assert.deepEqual(result.errors,[]);assert.deepEqual(result.workouts[0].sections[0].movements,['Front Sqart']);assert.equal(result.workouts[0].sections[0].movement,'');assert.ok(result.warnings.length);
 w.sections[0].movements=[];result=validateWorkouts([w]);assert.deepEqual(result.errors,[]);assert.equal(result.workouts[0].sections[0].movement,'');
 w.sections[0].movements=['front squat'];result=validateWorkouts([w]);assert.equal(result.workouts[0].sections[0].movement,'Front Squat');
 w.sections[0].movements=['Front Squat','Back Squat'];result=validateWorkouts([w]);assert.equal(result.workouts[0].sections[0].movement,'');
});
