import {test} from 'node:test';import assert from 'node:assert/strict';
import {database,identity,addMember} from './db.mjs';
import {memberPassAction,memberPassDelete,readMembership} from '../worker/member-service.js';
import {AVATAR_EMOJIS,validAvatar} from '../web/avatars.js';
test('native pass removal preserves attendance and history, rejects stale IDs, and requires an approved operator',async()=>{
 const{db}=database(),actor=identity('owner','admin'),target=identity('member'),now=new Date('2026-11-02T01:00:00Z');await addMember(db,actor);await addMember(db,target);
 const pass=await memberPassAction({DB:db},actor,{id:target.id,action:'register',kind:'visits',visits:10,startDate:'2026-11-01'},now);
 await db.prepare('INSERT INTO gym_attendance (user_id,date,created_at,pass_debited,membership_id) VALUES (?,?,?,?,?)').bind(target.id,'2026-11-01',now.toISOString(),1,pass.id).run();
 await assert.rejects(memberPassDelete({DB:db},target,{id:target.id,passId:pass.id},now),e=>e.status===403);
 await assert.rejects(memberPassDelete({DB:db},actor,{id:target.id,passId:'stale'},now),e=>e.status===409);
 await memberPassDelete({DB:db},actor,{id:target.id,passId:pass.id},now);assert.equal(await readMembership({DB:db},target.id),null);assert.ok(await db.prepare('SELECT date FROM gym_attendance WHERE user_id=?').bind(target.id).first());assert.equal((await db.prepare("SELECT count(*) AS n FROM gym_membership_events WHERE action='delete'").first()).n,1);
});
test('the 80-item avatar catalogue preserves existing emoji values and rejects arbitrary content',()=>{assert.equal(AVATAR_EMOJIS.length,80);assert.equal(new Set(AVATAR_EMOJIS).size,80);for(const emoji of ['🏋️','🦅','🍑','🐺','🌙'])assert.ok(validAvatar(emoji));assert.equal(validAvatar('<img>'),false);});
