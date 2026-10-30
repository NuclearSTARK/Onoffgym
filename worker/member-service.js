import {changeMembership,membershipState} from '../web/membership.js';
import {kstDate} from '../web/core.js';
export async function readMembership(env,id){return env.DB.prepare('SELECT * FROM gym_memberships WHERE user_id=?').bind(id).first();}
export async function memberPassAction(env,actor,b,now){
  if(actor.role!=='admin'||actor.status!=='approved')throw Object.assign(Error('운영자만 회원권을 관리할 수 있어요.'),{status:403});
  if(!await env.DB.prepare('SELECT id FROM gym_members WHERE id=?').bind(b.id).first())throw Object.assign(Error('회원을 찾을 수 없어요.'),{status:404});
  const old=await readMembership(env,b.id);let pass;try{pass=changeMembership(old,b,kstDate(now))}catch(e){throw Object.assign(e,{status:400})}
  const eventId=crypto.randomUUID();const revision=old?.revision??-1,stamp=now.toISOString(),event={before:old,after:pass,reason:String(b.reason||'').slice(0,200),actor:actor.id};
  const write=env.DB.prepare('INSERT INTO gym_memberships (user_id,id,kind,months,start_date,end_date,total_visits,remaining_visits,paused_at,revision,write_token,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,kind=excluded.kind,months=excluded.months,start_date=excluded.start_date,end_date=excluded.end_date,total_visits=excluded.total_visits,remaining_visits=excluded.remaining_visits,paused_at=excluded.paused_at,revision=excluded.revision,write_token=excluded.write_token,updated_at=excluded.updated_at WHERE gym_memberships.revision=?').bind(b.id,pass.id,pass.kind,pass.months,pass.start_date,pass.end_date,pass.total_visits,pass.remaining_visits,pass.paused_at,revision+1,eventId,stamp,revision);
  await env.DB.batch([write,env.DB.prepare('INSERT INTO gym_membership_events (id,user_id,action,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gym_memberships WHERE user_id=? AND revision=? AND write_token=?)').bind(eventId,b.id,b.action,JSON.stringify(event),stamp,b.id,revision+1,eventId)]);
  if(!await env.DB.prepare('SELECT id FROM gym_membership_events WHERE id=?').bind(eventId).first())throw Object.assign(Error('회원권이 변경됐어요. 새로 불러온 후 다시 시도해주세요.'),{status:409});
  return readMembership(env,b.id);
}
export async function memberCheckIn(env,member,now){
  const day=kstDate(now),id=member.id;
  if(await env.DB.prepare('SELECT date FROM gym_attendance WHERE user_id=? AND date=?').bind(id,day).first())return{ok:true,date:day,already:true};
  const pass=await readMembership(env,id),isStaff=['admin','coach'].includes(member.role);
  if(pass&&!membershipState(pass,day).active&&!isStaff)throw Object.assign(Error('회원권 기간·잔여횟수 또는 휴회 상태를 확인해주세요.'),{status:403});
  if(!pass||isStaff&&(!membershipState(pass,day).active)){
    await env.DB.prepare('INSERT OR IGNORE INTO gym_attendance (user_id,date,created_at,pass_debited) VALUES (?,?,?,-1)').bind(id,day,now.toISOString()).run();return{ok:true,date:day};
  }
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO gym_attendance (user_id,date,created_at,pass_debited,membership_id) SELECT ?,?,?,CASE WHEN kind='visits' THEN 0 ELSE -1 END,id FROM gym_memberships WHERE user_id=? AND id=? AND paused_at IS NULL AND start_date<=? AND (end_date IS NULL OR end_date>=?) AND (kind='period' OR remaining_visits>0)").bind(id,day,now.toISOString(),id,pass.id,day,day),
    env.DB.prepare("UPDATE gym_memberships SET remaining_visits=remaining_visits-1,revision=revision+1 WHERE user_id=? AND kind='visits' AND remaining_visits>0 AND EXISTS(SELECT 1 FROM gym_attendance a WHERE a.user_id=? AND a.date=? AND a.membership_id=gym_memberships.id AND a.pass_debited=0)").bind(id,id,day),
    env.DB.prepare('UPDATE gym_attendance SET pass_debited=1 WHERE user_id=? AND date=? AND pass_debited=0').bind(id,day)
  ]);
  if(!await env.DB.prepare('SELECT date FROM gym_attendance WHERE user_id=? AND date=?').bind(id,day).first())throw Object.assign(Error('출석 처리 중 회원권이 변경됐어요. 다시 확인해주세요.'),{status:409});
  return{ok:true,date:day};
}
export async function memberAttendanceCancel(env,actor,b,now){
  if(actor.role!=='admin')throw Object.assign(Error('운영자만 출석을 취소할 수 있어요.'),{status:403});
  if(!String(b.reason||'').trim())throw Object.assign(Error('취소 사유를 입력해주세요.'),{status:400});
  await env.DB.batch([
    env.DB.prepare("UPDATE gym_memberships SET remaining_visits=remaining_visits+1,revision=revision+1 WHERE user_id=? AND kind='visits' AND EXISTS(SELECT 1 FROM gym_attendance a WHERE a.user_id=? AND a.date=? AND a.membership_id=gym_memberships.id AND a.pass_debited=1)").bind(b.id,b.id,b.date),
    env.DB.prepare('INSERT INTO gym_membership_events (id,user_id,action,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gym_attendance WHERE user_id=? AND date=?)').bind(crypto.randomUUID(),b.id,'attendance-cancel',JSON.stringify({date:b.date,reason:String(b.reason).slice(0,200),actor:actor.id}),now.toISOString(),b.id,b.date),
    env.DB.prepare('DELETE FROM gym_attendance WHERE user_id=? AND date=?').bind(b.id,b.date)
  ]);return{ok:true};
}
