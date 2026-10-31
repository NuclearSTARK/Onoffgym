import {normalizeTvPreferences} from '../web/tv-colors.js';
import {tvWorkoutDate,workoutDayState,normalizeDate,addDays} from '../web/core.js';
import {HOLIDAY_FALLBACK} from '../web/holidays.js';
const tvJson=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const tvHex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function tvDigest(value){return tvHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
export async function tvPassword(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return tvHex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256));}
async function tvSetting(env,key){const row=await env.DB.prepare('SELECT value FROM gym_settings WHERE key=?').bind(key).first();return row?JSON.parse(row.value):null;}
export async function tvConfiguration(env,now=new Date()){
 const password=await tvSetting(env,'tvPassword'),rows=(await env.DB.prepare('SELECT device_id,last_seen,display_date,display_preferences FROM gym_tv_sessions WHERE expires>? ORDER BY last_seen DESC LIMIT 20').bind(+now).all()).results;
 const devices=rows.map((r,i)=>({id:r.device_id||'pending-'+i,online:!!r.last_seen&&+now-r.last_seen<=90000,lastSeen:r.last_seen?new Date(r.last_seen).toISOString():null,displayDate:r.display_date||null,preferences:r.display_preferences?normalizeTvPreferences(JSON.parse(r.display_preferences)):null}));
 return{configured:!!password,needsPinUpdate:!!password&&password.format!=='pin4',preferences:normalizeTvPreferences(await tvSetting(env,'tvDisplay')||{}),devices,shared:true};
}
function tvCookie(req,value,seconds){return `onoff_tv=${value}; Path=/api/tv; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export async function tvAdminSettings(req,env,member){
  if(member.role!=='admin'||member.status!=='approved')return tvJson({error:'운영자만 TV 설정을 변경할 수 있어요.'},403);
  const b=await req.json();let preferences;try{preferences=normalizeTvPreferences(b)}catch(e){return tvJson({error:e.message},400)}
  const jobs=[env.DB.prepare('INSERT INTO gym_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('tvDisplay',JSON.stringify(preferences))];
  if(b.password){if(typeof b.password!=='string'||!/^\d{4}$/.test(b.password))return tvJson({error:'TV 암호를 숫자 4자리로 입력해주세요.'},400);const salt=tvHex(crypto.getRandomValues(new Uint8Array(16))),hash=await tvPassword(b.password,salt);jobs.push(env.DB.prepare('INSERT INTO gym_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('tvPassword',JSON.stringify({salt,hash,format:'pin4'})),env.DB.prepare('DELETE FROM gym_tv_sessions'));}
  if(b.revoke===true)jobs.push(env.DB.prepare('DELETE FROM gym_tv_sessions'));
  await env.DB.batch(jobs);return tvJson({ok:true,...await tvConfiguration(env)});
}
export async function tvPublicRoute(req,env,now){
  const path=new URL(req.url).pathname;
  if(!['/api/tv/login','/api/tv/logout','/api/tv/bootstrap','/api/tv/heartbeat'].includes(path))return null;
  if(path==='/api/tv/logout'&&req.method==='POST'){
    const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)onoff_tv=([a-f0-9]+)/)?.[1];if(token)await env.DB.prepare('DELETE FROM gym_tv_sessions WHERE hash=?').bind(await tvDigest(token)).run();
    return tvJson({ok:true},200,{'Set-Cookie':tvCookie(req,'',0)});
  }
  if(path==='/api/tv/login'&&req.method==='POST'){
    const settings=await tvSetting(env,'tvPassword');if(!settings)return tvJson({error:'운영자가 TV 암호를 먼저 설정해주세요.'},503);
    if(settings.format!=='pin4')return tvJson({error:'운영 메뉴에서 TV 암호를 숫자 4자리로 다시 설정해주세요.'},503);
    const ip=await tvDigest(req.headers.get('CF-Connecting-IP')||'unknown'),attempt=await env.DB.prepare('SELECT * FROM gym_tv_attempts WHERE id=?').bind(ip).first();
    if(attempt&&+now-attempt.window_start<900000&&attempt.count>=5)return tvJson({error:'암호를 여러 번 잘못 입력했어요. 15분 후 다시 시도해주세요.'},429);
    const b=await req.json(),password=typeof b.password==='string'&&/^\d{4}$/.test(b.password)?b.password:'';
    // Count attempts before hashing, including concurrent attempts.
    await env.DB.prepare('INSERT INTO gym_tv_attempts (id,count,window_start) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN window_start>? THEN count+1 ELSE 1 END,window_start=CASE WHEN window_start>? THEN window_start ELSE excluded.window_start END').bind(ip,+now,+now-900000,+now-900000).run();
    const updated=await env.DB.prepare('SELECT count FROM gym_tv_attempts WHERE id=?').bind(ip).first();if(updated.count>5)return tvJson({error:'잠시 후 다시 시도해주세요.'},429);
    const hash=await tvPassword(password,settings.salt);let mismatch=hash.length^settings.hash.length;for(let i=0;i<hash.length;i++)mismatch|=hash.charCodeAt(i)^settings.hash.charCodeAt(i);
    if(mismatch)return tvJson({error:'TV 암호를 확인해주세요.'},401);
    const token=tvHex(crypto.getRandomValues(new Uint8Array(32))),expires=+now+30*86400000;
    await env.DB.batch([env.DB.prepare('INSERT INTO gym_tv_sessions (hash,expires) VALUES (?,?)').bind(await tvDigest(token),expires),env.DB.prepare('DELETE FROM gym_tv_attempts WHERE id=?').bind(ip),env.DB.prepare('DELETE FROM gym_tv_sessions WHERE expires<?').bind(+now)]);
    return tvJson({ok:true},200,{'Set-Cookie':tvCookie(req,token,30*86400)});
  }
  if(path==='/api/tv/bootstrap'&&req.method==='GET'||path==='/api/tv/heartbeat'&&req.method==='POST'){
    const token=req.headers.get('Cookie')?.match(/(?:^|;\s*)onoff_tv=([a-f0-9]{64})/)?.[1];
    const session=token?await env.DB.prepare('SELECT expires FROM gym_tv_sessions WHERE hash=?').bind(await tvDigest(token)).first():null;
    if(!session||session.expires<=+now)return tvJson({error:'TV 전용 암호로 접속해주세요.'},401);
    const setting=await env.DB.prepare('SELECT value FROM gym_settings WHERE key=?').bind('releaseTime').first(),releaseTime=setting?.value||'22:00',date=tvWorkoutDate(now,releaseTime);
    if(path==='/api/tv/heartbeat'){
      const b=await req.json();if(!normalizeDate(b.displayDate)||b.displayDate>date||b.displayDate<addDays(date,-1))return tvJson({error:'TV에 표시 중인 운동 날짜를 확인해주세요.'},400);
      let preferences;try{preferences=normalizeTvPreferences(b.preferences||{})}catch(e){return tvJson({error:e.message},400)}
      await env.DB.prepare('UPDATE gym_tv_sessions SET device_id=COALESCE(device_id,?),last_seen=?,display_date=?,display_preferences=? WHERE hash=?').bind(crypto.randomUUID(),+now,b.displayDate,JSON.stringify(preferences),await tvDigest(token)).run();
      return tvJson({ok:true,serverNow:now.toISOString()});
    }
    const rows=(await env.DB.prepare('SELECT body FROM gym_workouts WHERE date=? AND release_at<=? ORDER BY program').bind(date,+now).all()).results;
    const cached=await env.DB.prepare('SELECT body FROM gym_holiday_cache WHERE key=?').bind('KR').first(),holidays=cached?JSON.parse(cached.body).dates:HOLIDAY_FALLBACK;
    return tvJson({date,releaseTime,dayState:workoutDayState(date,holidays),holidayName:holidays[date]?.name||'',serverNow:now.toISOString(),workouts:rows.map(r=>JSON.parse(r.body)),preferences:(await tvConfiguration(env)).preferences});
  }
  return tvJson({error:'지원하지 않는 TV 요청입니다.'},405);
}
