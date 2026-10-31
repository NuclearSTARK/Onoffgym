import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RM_CATALOGUE,findRmMovement,updateRmCatalogue,synchronizeRmMovements,rmPercentages,attendanceEmoji} from '../web/rm-catalogue.js';
import {api} from '../worker/api.js';
import {database,addMember,identity,fixture} from './db.mjs';
test('the 27-item catalogue starts with six defaults and exact movement variants stay separate',()=>{
 assert.equal(DEFAULT_RM_CATALOGUE.length,27);assert.equal(DEFAULT_RM_CATALOGUE.filter(m=>m.isDefault).length,6);
 assert.equal(findRmMovement(DEFAULT_RM_CATALOGUE,'Strict Press').id,'shoulder-press');assert.equal(findRmMovement(DEFAULT_RM_CATALOGUE,'Sqaut Snatch').id,'squat-snatch');
 assert.notEqual(findRmMovement(DEFAULT_RM_CATALOGUE,'Power Clean').id,findRmMovement(DEFAULT_RM_CATALOGUE,'Power Clean & Jerk').id);
 assert.equal(findRmMovement(DEFAULT_RM_CATALOGUE,'5 Back Squat'),undefined);
});
test('catalogue rename and deactivation preserve IDs, aliases and canonical record weights',()=>{
 const before=structuredClone(DEFAULT_RM_CATALOGUE),entry=before.find(m=>m.id==='back-squat');
 const changed=updateRmCatalogue(before,{...entry,name:'Back Squat Test',active:false,isDefault:true});
 assert.equal(changed.movement.id,'back-squat');assert.equal(changed.movement.isDefault,false);assert.equal(findRmMovement(changed.catalogue,'Back Squat').id,'back-squat');
 const state={records:[{id:'r',movement:'Back Squat',lbs:200}],rms:[{id:'rm',memberId:'a',movement:'Back Squat',lbs:200}]};
 synchronizeRmMovements(state,changed.catalogue);assert.equal(state.rms[0].movementId,'back-squat');assert.equal(state.rms[0].lbs,200);assert.equal(state.rms[0].movement,'Back Squat Test');
 assert.throws(()=>updateRmCatalogue(before,{...entry,name:'Front Squat'}));
 assert.throws(()=>updateRmCatalogue(before,{...entry,id:'missing'}));
 const added=updateRmCatalogue(before,{name:'Zercher Squat',category:'squat',active:true,isDefault:false},()=> 'fixed');assert.equal(added.movement.id,'custom-fixed');
});
test('personal percentages keep canonical lbs and attendance markers stay stable by date',()=>{
 assert.deepEqual(rmPercentages(200).map(r=>r.lbs),[100,120,140,160,180]);assert.deepEqual(rmPercentages(0),[]);
 assert.equal(attendanceEmoji('2026-11-02'),attendanceEmoji('2026-11-02'));
 assert.ok(new Set(['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05'].map(attendanceEmoji)).size>1);
});
test('catalogue administration is operator-only and custom names work in class uploads',async()=>{
 const {db}=database();await addMember(db,identity('member'));const env={DB:db,ONOFF_OWNER_EMAIL:'owner@example.test',holidayFetch:async()=>{throw Error('offline')}},now=new Date('2026-11-02T01:00:00Z');
 async function call(id,path,body){const headers={'oai-authenticated-user-id':id,'oai-authenticated-user-email':id==='owner'?'owner@example.test':'member@example.test'};if(body)Object.assign(headers,{Origin:'https://gym.test','Content-Type':'application/json'});const r=await api(new Request('https://gym.test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env,now);return{status:r.status,data:await r.json()};}
 const entry={name:'Zercher Squat',category:'squat',active:true,isDefault:false};
 assert.equal((await call('member','/api/rm-catalogue',entry)).status,403);
 const result=await call('owner','/api/rm-catalogue',entry);assert.equal(result.status,200);assert.equal(result.data.catalogue.length,28);
 const boot=(await call('member','/api/bootstrap')).data;assert.equal(boot.rmCatalogue.length,28);assert.ok(boot.library.some(m=>m.name==='Zercher Squat'));
 const w=fixture('2026-11-02');w.sections[0].movements=['Zercher Squat'];assert.equal((await call('owner','/api/workouts',{workouts:[w]})).status,200);
 const renamed=await call('owner','/api/rm-catalogue',{...result.data.movement,name:'Zercher Squat Renamed'});assert.equal(renamed.data.movement.id,result.data.movement.id);
 assert.equal((await call('owner','/api/workouts',{workouts:[w],overwrite:true})).status,200);
});
