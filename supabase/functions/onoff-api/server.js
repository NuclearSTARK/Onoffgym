import {MOVEMENTS,DEFAULT_BANNER,KINDS,kstDate,normalizeDate,validateWorkouts,youtubeId,validBanner,tvWorkoutDate,workoutDayState,addDays} from '../../../web/core.js';
import {HOLIDAY_FALLBACK,HOLIDAY_SOURCE,parseHolidayCalendar} from '../../../web/holidays.js';
import {DEFAULT_RM_CATALOGUE,updateRmCatalogue,findRmMovement} from '../../../web/rm-catalogue.js';
import {membershipState,changeMembership} from '../../../web/membership.js';
import {normalizeTvPreferences} from '../../../web/tv-colors.js';
import {tvDigest,tvPassword} from '../../../worker/tv-service.js';

const ORIGINS=new Set(['https://nuclearstark.github.io','https://onoff-crossfit-gym.powerloding.chatgpt.site']);
const bad=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v,min,max,label)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)bad(label+'을 확인해주세요.');return v.trim();};
export function createHandler(db,{verifyUser,fetchCalendar=fetch,now=()=>new Date()}={}){
 async function result(q){const {data,error}=await q;if(error){const code=error.code;bad(code==='42501'?'이 요청을 처리할 권한이 없어요.':code==='23505'?'이미 등록된 항목이 있어요. 새로 불러온 뒤 확인해주세요.':code==='40001'?'다른 기기에서 변경됐어요. 다시 불러와 주세요.':'저장 요청을 처리하지 못했어요.',code==='42501'?403:['23505','40001'].includes(code)?409:503);}return data;}
 const rows=(table,configure=q=>q)=>result(configure(db.from(table).select('*')));
 const one=(table,key,value)=>result(db.from(table).select('*').eq(key,value).maybeSingle());
 async function setting(key,fallback){const row=await one('gym_settings','key',key);return row?.value??fallback;}
 const commit=(actor,op,p={})=>result(db.rpc('onoff_commit',{actor,op,p}));
 async function member(req){const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)bad('카카오 로그인 연결 후 이용할 수 있어요.',401);const user=await verifyUser(token);if(!user?.id||user.is_anonymous)bad('다시 로그인해주세요.',401);let m=await one('gym_members','id',user.id);if(!m)m=await commit(user.id,'ensure-member');return m;}
 const approved=m=>{if(m.status!=='approved')bad('관리자 승인 후 이용할 수 있어요.',403);};
 const admin=m=>{approved(m);if(m.role!=='admin')bad('운영자 권한이 필요해요.',403);};
 async function library(){const [custom,catalogue]=await Promise.all([rows('gym_movements'),setting('rmCatalogue',DEFAULT_RM_CATALOGUE)]);const map=new Map(MOVEMENTS.map(name=>[name,{name,videoId:'',notes:''}]));for(const m of custom)map.set(m.name,m.body);for(const m of catalogue)for(const name of [m.name,...(m.aliases||[])])if(!map.has(name))map.set(name,{name,videoId:'',notes:''});return [...map.values()];}
 async function calendar(force=false){const cached=await one('gym_holiday_cache','key','KR');if(!force&&cached&&+now()-Date.parse(cached.updated_at)<86400000)return cached.body;try{const res=await fetchCalendar(HOLIDAY_SOURCE,{signal:AbortSignal.timeout(5000)});if(!res.ok)throw Error('calendar');const value={dates:parseHolidayCalendar(await res.text()),source:'Google 대한민국 공휴일 캘린더',updatedAt:now().toISOString(),fallback:false};await result(db.from('gym_holiday_cache').upsert({key:'KR',body:value,updated_at:now().toISOString()}));return value;}catch{return cached?{...cached.body,stale:true}:{dates:HOLIDAY_FALLBACK,source:'Google 대한민국 공휴일 캘린더',updatedAt:'2026-10-30T00:00:00Z',fallback:true};}}
 async function revision(m){const rt=await setting('releaseTime','22:00'),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now());return {revision:[await setting('revision',0),kstDate(now()),clock>=rt?1:0,m.status,m.role].join(':'),serverNow:now().toISOString()};}
 async function tvSettings(){const [pin,prefs,devices]=await Promise.all([setting('tvPassword',null),setting('tvDisplay',{}),rows('gym_tv_sessions',q=>q.gt('expires',now().toISOString()).order('last_seen',{ascending:false,nullsFirst:false}).limit(20))]);return {configured:!!pin,needsPinUpdate:false,preferences:normalizeTvPreferences(prefs),shared:true,devices:devices.map(d=>({id:d.device_id,lastSeen:d.last_seen,online:!!d.last_seen&&+now()-Date.parse(d.last_seen)<=90000,displayDate:d.display_date,preferences:d.display_preferences}))};}
 async function tv(req,path,b){
  const token=req.headers.get('X-OnOff-TV-Token');
  if(path==='/api/tv/login'){
   const pin=await setting('tvPassword',null);if(!pin)bad('운영자가 TV 암호를 먼저 설정해주세요.',503);
   // These headers are supplied by the Supabase gateway; no client device-ID limiter.
   const peer=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||req.headers.get('cf-connecting-ip')||'unknown';
   const attemptId=await tvDigest(peer),attempt=await result(db.rpc('onoff_tv_attempt',{ip_hash:attemptId}));if(!attempt.allowed)bad('암호를 여러 번 입력했어요. 15분 후 다시 시도해주세요.',429);
   const value=typeof b.password==='string'&&/^\d{4}$/.test(b.password)?b.password:'',hash=await tvPassword(value,pin.salt);
   let mismatch=hash.length^pin.hash.length;for(let i=0;i<hash.length;i++)mismatch|=hash.charCodeAt(i)^pin.hash.charCodeAt(i);if(mismatch)bad('TV 암호를 확인해주세요.',401);
   const raw=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
   await commit(null,'tv-login',{hash:await tvDigest(raw),pinHash:pin.hash,attemptId:'ip:'+attemptId});return {ok:true,token:raw};
  }
  if(!token||!/^[a-f0-9]{64}$/.test(token))bad('TV 전용 암호로 접속해주세요.',401);
  const hash=await tvDigest(token),session=await one('gym_tv_sessions','hash',hash);if(!session||Date.parse(session.expires)<=+now())bad('TV 전용 암호로 접속해주세요.',401);
  if(path==='/api/tv/logout'){await result(db.from('gym_tv_sessions').delete().eq('hash',hash));return {ok:true};}
  const releaseTime=await setting('releaseTime','22:00'),date=tvWorkoutDate(now(),releaseTime);
  if(path==='/api/tv/heartbeat'){if(!normalizeDate(b.displayDate)||b.displayDate>date||b.displayDate<addDays(date,-1))bad('TV 표시 날짜를 확인해주세요.');await result(db.from('gym_tv_sessions').update({last_seen:now().toISOString(),display_date:b.displayDate,display_preferences:normalizeTvPreferences(b.preferences||{})}).eq('hash',hash));return {ok:true,serverNow:now().toISOString()};}
  const [ws,holidays,prefs]=await Promise.all([rows('gym_workouts',q=>q.eq('date',date).lte('release_at',now().toISOString())),calendar(),setting('tvDisplay',{})]);return {date,releaseTime,serverNow:now().toISOString(),dayState:workoutDayState(date,holidays.dates),holidayName:holidays.dates[date]?.name||'',workouts:ws.map(w=>w.body),preferences:normalizeTvPreferences(prefs)};
 }
 async function bootstrap(m,url){
  const rev=await revision(m);if(m.status!=='approved')return {viewer:m,workouts:{},library:[],members:[],...rev};
  const staff=m.role==='admin',all=staff&&url.searchParams.get('view')!=='member',day=kstDate(now()),viewDate=normalizeDate(url.searchParams.get('date'))||day;
  const [pass,att,memberRows,prefs,cal,noticeRows,cat,lib]=await Promise.all([
   one('gym_memberships','user_id',m.id),rows('gym_attendance',q=>q.eq('user_id',m.id).order('date',{ascending:false}).limit(1000)),
   rows('gym_members',q=>staff?q:q.eq('status','approved')),one('gym_preferences','user_id',m.id),calendar(),rows('gym_notices',q=>q.order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(200)),setting('rmCatalogue',DEFAULT_RM_CATALOGUE),library()
  ]);
  const access=membershipState(pass,day,att.some(a=>a.date===day&&a.membership_id===pass?.id)),canRead=staff||access.active;
  const ws=canRead?await rows('gym_workouts',q=>{q=q.or(`date.gte.${addDays(day,-30)},date.eq.${viewDate}`);return (all?q:q.lte('release_at',now().toISOString())).order('date',{ascending:false}).limit(1000);}):[];
  if(canRead&&!ws.some(w=>w.date===viewDate)){const selected=await rows('gym_workouts',q=>{q=q.eq('date',viewDate);return all?q:q.lte('release_at',now().toISOString());});ws.push(...selected);}
  const [ownRecords,selectedRecords,rms,posts,comments,joins,notes,passes,events,attAll]=await Promise.all([
   rows('gym_records',q=>q.eq('user_id',m.id).order('date',{ascending:false}).limit(1000)),
   canRead?rows('gym_records',q=>q.eq('date',viewDate).limit(1000)):[],
   rows('gym_rms',q=>q.eq('user_id',m.id).order('body->>date',{ascending:false}).limit(1000)),canRead?rows('gym_posts',q=>q.order('created_at',{ascending:false}).limit(200)):[],
   canRead?rows('gym_comments',q=>q.order('created_at').limit(1000)):[],canRead?rows('gym_post_joins',q=>q.limit(1000)):[],
   staff?rows('gym_member_notes'):[],staff?rows('gym_memberships'):[],staff?rows('gym_membership_events',q=>q.order('created_at',{ascending:false}).limit(500)):[],staff?rows('gym_attendance',q=>q.order('date',{ascending:false}).limit(2000)):[]
  ]);
  const records=[...new Map([...ownRecords,...selectedRecords].map(r=>[r.id,r])).values()],names=new Map(memberRows.map(x=>[x.id,x.name])),rank=new Map();
  // Ranking preference is not derived from JWT or editable names.
  if(canRead){for(const p of await rows('gym_preferences',q=>q.limit(1000)))rank.set(p.user_id,p.body.rank!==false);}
  return {viewer:m,...rev,memberView:!all,shared:true,releaseTime:await setting('releaseTime','22:00'),banner:await setting('banner',DEFAULT_BANNER),rmCatalogue:cat,library:lib,
   calendar:cal,membership:pass,membershipState:access,memberships:passes,membershipEvents:events.map(e=>({...e,body:JSON.stringify(e.body)})),memberAttendance:attAll,attendance:att.map(a=>a.date),
   members:staff?memberRows.map(x=>({...x,note:notes.find(n=>n.user_id===x.id)?.note||''})):[],
   workouts:Object.fromEntries(ws.map(w=>[w.key,w.body])),publishedDates:[...new Set(ws.filter(w=>Date.parse(w.release_at)<=+now()).map(w=>w.date))],
   notices:canRead?noticeRows.map(n=>({...n,category:'공지사항',author:names.get(n.author_id)||'운영자',serverNotice:true,date:kstDate(new Date(n.created_at)),comments:[],joined:[]})):[],
   records:records.map(r=>({...r.body,id:r.id,memberId:r.user_id,name:names.get(r.user_id)||'회원',rank:rank.get(r.user_id)!==false})),
   rms:rms.map(r=>({...r.body,id:r.id,memberId:r.user_id})),preferences:prefs?.body||{},
   posts:posts.map(p=>({...p,authorId:p.author_id,author:names.get(p.author_id)||'회원',date:kstDate(new Date(p.created_at)),joined:[],joinedIds:joins.filter(j=>j.post_id===p.id).map(j=>j.user_id),joinedNames:Object.fromEntries(joins.filter(j=>j.post_id===p.id).map(j=>[j.user_id,names.get(j.user_id)||'회원'])),comments:comments.filter(c=>c.post_id===p.id).map(c=>({...c,authorId:c.author_id,author:names.get(c.author_id)||'회원'}))})),
   tv:staff?await tvSettings():undefined,push:{configured:false,publicKey:'',schedulerConfigured:false},historyLimit:1000
  };
 }
 async function route(req,path,url,b){
  if(path==='/api/health')return {ok:true,backend:'supabase',serverNow:now().toISOString()};
  if(['/api/tv/login','/api/tv/logout','/api/tv/bootstrap','/api/tv/heartbeat'].includes(path))return tv(req,path,b);
  const m=await member(req);
  if(path==='/api/revision')return revision(m);
  if(path==='/api/bootstrap')return bootstrap(m,url);
  if(path==='/api/profile')return commit(m.id,'profile',{name:text(b.name,2,30,'실명')});
  approved(m);
  if(path==='/api/attendance')return commit(m.id,'attendance');
  if(path==='/api/preferences'){
   const p={};if('rank' in b){if(typeof b.rank!=='boolean')bad('순위 설정을 확인해주세요.');p.rank=b.rank;}if('rmSelection' in b){const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE);if(!Array.isArray(b.rmSelection)||b.rmSelection.length>200||b.rmSelection.some(id=>!cat.some(m=>m.id===id)))bad('1RM 종목을 확인해주세요.');p.rmSelection=[...new Set(b.rmSelection)];}return commit(m.id,'preferences',p);
  }
  if(path==='/api/records'){
   const list=b.records;if(!Array.isArray(list)||list.length<1||list.length>200)bad('기록 목록을 확인해주세요.');if(list.length>1)admin(m);
   const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),cache=new Map(),clean=[];
   for(const r of list){
    const id=r.id||crypto.randomUUID(),memberId=r.memberId||m.id;if(!uuid(id)||!uuid(memberId))bad('회원과 기록 ID를 확인해주세요.');if(memberId!==m.id)admin(m);
    if(!normalizeDate(r.date)||r.date>kstDate(now())||!['B/T','WOD'].includes(r.program)||!/^S[1-9]\d?$/.test(r.section))bad('기록 날짜와 수업을 확인해주세요.');
    const key=r.date+'_'+r.program;if(!cache.has(key))cache.set(key,await one('gym_workouts','key',key));const w=cache.get(key),sec=w?.body.sections?.[+r.section.slice(1)-1];
    if(!sec?.record||Date.parse(w.release_at)>+now())bad('공개된 수업의 기록 구간을 선택해주세요.');
    if(r.session&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.session))bad('수업 시간을 확인해주세요.');
    const movement=sec.movement||sec.movements?.[0]||'',rm=findRmMovement(cat,movement),item={id,memberId,date:r.date,program:r.program,section:r.section,session:r.session||'',kind:sec.kind,movement,movements:sec.movements||[],movementId:rm?.id,note:typeof r.note==='string'?text(r.note,0,150,'메모'):'',writer:m.role};
    if(['중량','1RM'].includes(sec.kind)){if(!Number.isFinite(r.lbs)||r.lbs<=0||r.lbs>6614)bad('중량을 확인해주세요.');item.lbs=r.lbs;}
    else {item.value=text(r.value,1,120,'운동 결과');if(sec.kind==='시간'&&!/^\d{1,3}:[0-5]\d$/.test(item.value)||['횟수','칼로리'].includes(sec.kind)&&!/^\d+$/.test(item.value))bad('운동 결과 형식을 확인해주세요.');}
    clean.push(item);
   }
   return commit(m.id,'records',{records:clean});
  }
  if(path==='/api/rms'){const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),mov=findRmMovement(cat,b.movementId||b.movement);if(!mov?.active||!Number.isFinite(b.lbs)||b.lbs<=0||b.lbs>6614||!normalizeDate(b.date)||b.date>kstDate(now()))bad('1RM 종목·중량·날짜를 확인해주세요.');return commit(m.id,'rm',{id:crypto.randomUUID(),memberId:m.id,movementId:mov.id,movement:mov.name,lbs:b.lbs,date:b.date});}
  if(path==='/api/posts'){if(!['운동 번개','공동구매','자유글'].includes(b.category))bad('말머리를 확인해주세요.');return commit(m.id,'post',{category:b.category,title:text(b.title,1,80,'제목'),body:text(b.body,1,3000,'내용')});}
  if(['/api/posts/delete','/api/posts/join','/api/posts/comment'].includes(path)){if(!uuid(b.id))bad('게시글을 확인해주세요.');return commit(m.id,path.endsWith('delete')?'post-delete':path.endsWith('join')?'join':'comment',{id:b.id,...(path.endsWith('comment')?{text:text(b.text,1,300,'댓글')}:{})});}
  if(path.startsWith('/api/push/'))bad('Supabase 알림 발송 연결을 준비 중입니다.',503);
  admin(m);
  if(path==='/api/tv/status')return tvSettings();
  if(path==='/api/tv/admin'){const p={preferences:normalizeTvPreferences(b),revoke:b.revoke===true};if(b.password){if(!/^\d{4}$/.test(b.password))bad('TV 암호는 숫자 4자리예요.');const salt=crypto.randomUUID();p.password={salt,hash:await tvPassword(b.password,salt),format:'pin4'};}await commit(m.id,'tv-admin',p);return {ok:true,...await tvSettings()};}
  if(path==='/api/member-name'||path==='/api/member-note'||path==='/api/members'){if(!uuid(b.id)||!await one('gym_members','id',b.id))bad('회원을 찾을 수 없어요.',404);if(path.endsWith('member-name'))return commit(m.id,'member-name',{id:b.id,name:text(b.name,2,30,'실명')});if(path.endsWith('member-note'))return commit(m.id,'member-note',{id:b.id,note:text(b.note,0,500,'구분 메모')});if(!['admin','member'].includes(b.role)||!['approved','pending','suspended'].includes(b.status))bad('회원 권한을 확인해주세요.');return commit(m.id,'members',{id:b.id,role:b.role,status:b.status});}
  if(path==='/api/membership'){if(!uuid(b.id))bad('회원을 확인해주세요.');const old=await one('gym_memberships','user_id',b.id);let pass;try{pass=changeMembership(old,b,kstDate(now()));}catch(e){bad(e.message);}return commit(m.id,'membership',{id:b.id,action:b.action,pass,revision:old?.revision??-1,reason:String(b.reason||'').slice(0,200)});}
  if(path==='/api/attendance/cancel'){if(!uuid(b.id)||!normalizeDate(b.date)||b.date>kstDate(now()))bad('회원과 출석 날짜를 확인해주세요.');return commit(m.id,'attendance-cancel',{id:b.id,date:b.date,reason:text(b.reason,1,200,'취소 사유')});}
  if(path==='/api/workouts'){const [lib,cal]=await Promise.all([library(),calendar()]),v=validateWorkouts(b.workouts,lib.map(m=>m.name),cal.dates);if(v.errors.length)bad(v.errors.join('\n'));await commit(m.id,'workouts',{workouts:v.workouts,overwrite:b.overwrite===true});return {ok:true,count:v.workouts.length};}
  if(path==='/api/settings'){if(typeof b.releaseTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.releaseTime))bad('공개 시간을 확인해주세요.');await commit(m.id,'settings',{releaseTime:b.releaseTime});return {ok:true,releaseTime:b.releaseTime};}
  if(path==='/api/banner'){if(!validBanner(b))bad('공지 문구·색상·노출 여부를 확인해주세요.');const banner={text:b.text.trim(),color:b.color,enabled:b.enabled};await commit(m.id,'setting',{key:'banner',value:banner});return {ok:true,banner};}
  if(path==='/api/rm-catalogue'){let value;try{value=updateRmCatalogue(await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),b);}catch(e){bad(e.message);}await commit(m.id,'setting',{key:'rmCatalogue',value:value.catalogue});return {ok:true,...value};}
  if(path==='/api/movements'){const name=text(b.name,2,80,'동작 이름'),videoId=b.url?youtubeId(b.url):'';if(videoId===null)bad('유튜브 주소를 확인해주세요.');return commit(m.id,'movements',{name,videoId,notes:text(b.notes,0,1000,'설명')});}
  if(path==='/api/notices'){if(b.sendPush)bad('알림 서버 연결 전에는 알림 보내기를 해제해주세요.',503);if(b.id&&!uuid(b.id))bad('공지를 확인해주세요.');if(b.action==='delete')return commit(m.id,'notices',{action:'delete',id:b.id});if(typeof b.pinned!=='boolean')bad('상단 고정 여부를 확인해주세요.');return commit(m.id,'notices',{id:b.id,title:text(b.title,1,100,'제목'),body:text(b.body,1,5000,'내용'),pinned:b.pinned});}
  if(path==='/api/holidays/sync')return {ok:true,calendar:await calendar(true)};
  bad('요청을 찾을 수 없어요.',404);
 }
 return async req=>{
  const origin=req.headers.get('Origin'),allowed=!origin||ORIGINS.has(origin),cors={'Access-Control-Allow-Origin':allowed&&origin?origin:'https://nuclearstark.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-onoff-tv-token','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
  try{
   if(!allowed)bad('허용된 앱에서 접속해주세요.',403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   const url=new URL(req.url),match=url.pathname.match(/\/api\/[^?]+$/),path=match?.[0];if(!path)bad('요청을 찾을 수 없어요.',404);
   const get=new Set(['/api/health','/api/bootstrap','/api/revision','/api/tv/bootstrap','/api/tv/status']);if(req.method!==(get.has(path)?'GET':'POST'))bad('지원하지 않는 요청 방식이에요.',405);
   let b={};if(req.method==='POST'){if(!req.headers.get('Content-Type')?.startsWith('application/json'))bad('JSON 요청만 사용할 수 있어요.',415);const raw=await req.text();if(raw.length>2_000_000)bad('요청이 너무 커요.',413);try{b=JSON.parse(raw);}catch{bad('요청 형식을 확인해주세요.');}if(!b||typeof b!=='object'||Array.isArray(b))bad('요청 형식을 확인해주세요.');}
   return response(await route(req,path,url,b));
  }catch(e){if(!e.status)console.error('ONOFF request failed',e.name);return response({error:e.status?e.message:'서버 연결을 확인해주세요.'},e.status||503);}
 };
}
