import {canonicalRecordPayload} from '../../../web/record-schema.js';
import {participationAccess} from '../../../web/participation-access.js';
import {createNamedService} from './named-service.js';
import {PRIVACY_VERSION} from '../../../web/privacy-version.js';
import {createPointsService} from './points-service.js';
import {VIDEO_CATEGORIES,videoCategory,resolveVideoCategory,findVideoMovement} from '../../../web/video-library.js';
import {createMediaService} from './media-service.js';
import {hasPermission,COACH_PERMISSIONS} from '../../../web/permissions.js';
import {validAvatar,avatarEmoji} from '../../../web/avatars.js';
import {createAccountService} from './account-service.js';
import {MOVEMENTS,DEFAULT_BANNER,KINDS,kstDate,normalizeDate,validateWorkouts,workoutSchedule,youtubeId,validBanner,tvWorkoutDate,workoutDayState,addDays} from '../../../web/core.js';
import {HOLIDAY_FALLBACK,HOLIDAY_SOURCE,parseHolidayCalendar} from '../../../web/holidays.js';
import {RM_CATEGORIES,DEFAULT_RM_CATALOGUE,updateRmCatalogue,findRmMovement} from '../../../web/rm-catalogue.js';
import {membershipState,changeMembership} from '../../../web/membership.js';
import {normalizeTvPreferences} from '../../../web/tv-colors.js';
import {tvDigest,tvPassword} from '../../../worker/tv-service.js';
import {createPushService} from './push-service.js';

const ORIGINS=new Set(['https://nuclearstark.github.io','https://onoff-crossfit-gym.powerloding.chatgpt.site']);
const bad=(message,status=400,extra={})=>{throw Object.assign(Error(message),{status,...extra});};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v,min,max,label)=>{if(typeof v!=='string'||v.trim().length<min||v.length>max)bad(label+'을 확인해주세요.');return v.trim();};
export function createHandler(db,{verifyUser,reauthenticate,fetchCalendar=fetch,now=()=>new Date()}={}){
 const media=createMediaService(db,{now}),points=createPointsService(db,{now});
 const push=createPushService(db,{now}),account=createAccountService(db,{reauthenticate}),named=createNamedService(db);
 async function result(q){const {data,error}=await q;if(error){const code=error.code;if(code==='23514')bad(error.message?.includes('14세')?'회원이 먼저 만 14세 이상 확인과 개인정보 안내 동의를 완료해야 승인할 수 있어요.':'변경할 수 없는 계정 상태입니다.',409);bad(code==='42501'?'이 요청을 처리할 권한이 없어요.':code==='23505'?'이미 등록된 항목이 있어요. 새로 불러온 뒤 확인해주세요.':code==='40001'?'다른 기기에서 변경됐어요. 다시 불러와 주세요.':'저장 요청을 처리하지 못했어요.',code==='42501'?403:['23505','40001'].includes(code)?409:503);}return data;}
 const rows=(table,configure=q=>q)=>result(configure(db.from(table).select('*')));
 const one=(table,key,value)=>result(db.from(table).select('*').eq(key,value).maybeSingle());
 async function setting(key,fallback){const row=await one('gym_settings','key',key);return row?.value??fallback;}
 const commit=(actor,op,p={})=>result(db.rpc('onoff_commit',{actor,op,p}));
 async function member(req){const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)bad('이메일로 로그인해주세요.',401);const user=await verifyUser(token);if(!user?.id||user.is_anonymous)bad('다시 로그인해주세요.',401);let m=await one('gym_members','id',user.id);if(!m)m=await commit(user.id,'ensure-member');return {...m,email:user.email||''};}
 const approved=m=>{if(m.status!=='approved')bad('관리자 승인 후 이용할 수 있어요.',403);};
 const permit=(m,key)=>{approved(m);if(!hasPermission(m,key))bad('이 기능의 권한이 필요해요.',403);};
 const admin=m=>{approved(m);if(m.role!=='admin')bad('운영자 권한이 필요해요.',403);};
 async function videoCategories(){const data=await rows('gym_video_categories',q=>q.order('position').order('label'));return data.length?data.map(c=>[c.id,c.label]):VIDEO_CATEGORIES;}
 async function library(){const [custom,catalogue,categories,redirects]=await Promise.all([rows('gym_movements'),setting('rmCatalogue',DEFAULT_RM_CATALOGUE),videoCategories(),setting('videoCategoryRedirects',{})]);const map=new Map(MOVEMENTS.map(name=>[name,{name,videoId:'',notes:''}])),deleted=new Set(custom.filter(m=>m.deleted).map(m=>m.name));for(const m of custom)if(!m.deleted)map.set(m.name,{...m.body,name:m.name,categoryId:m.category_id||m.body.categoryId});for(const m of catalogue)for(const name of [m.name,...(m.aliases||[])])if(!map.has(name))map.set(name,{name,videoId:'',notes:''});return [...map.values()].filter(m=>!deleted.has(m.name)).map(m=>({...m,categoryId:resolveVideoCategory(m.categoryId||videoCategory(m.name,catalogue),categories,redirects)}));}

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
 async function joinAccess(m,id){const [post,pass]=await Promise.all([one('gym_posts','id',id),one('gym_memberships','user_id',m.id)]),author=post?await one('gym_members','id',post.author_id):null,day=kstDate(now());const attendance=pass?.kind==='visits'&&pass.remaining_visits===0?await rows('gym_attendance',q=>q.eq('user_id',m.id).eq('date',day).eq('membership_id',pass.id)):[];return participationAccess({viewer:m,author,post,pass,today:day,attendedToday:attendance.length>0});}
 async function bootstrap(m,url){
  const rev=await revision(m);if(m.status!=='approved')return {viewer:m,privacyReviewRequired:m.privacy_version!==PRIVACY_VERSION,workouts:{},library:[],members:[],...rev};
  const staff=m.role==='admin',all=hasPermission(m,'workouts.read')&&url.searchParams.get('view')!=='member',day=kstDate(now()),viewDate=normalizeDate(url.searchParams.get('date'))||day;
  const [pass,att,memberRows,prefs,cal,noticeRows,cat,lib,pointData]=await Promise.all([
   one('gym_memberships','user_id',m.id),rows('gym_attendance',q=>q.eq('user_id',m.id).order('date',{ascending:false}).limit(1000)),
   rows('gym_members',q=>staff?q:q.eq('status','approved')),one('gym_preferences','user_id',m.id),calendar(),rows('gym_notices',q=>q.order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(200)),setting('rmCatalogue',DEFAULT_RM_CATALOGUE),library(),points.snapshot(m)
  ]);
  const access=membershipState(pass,day,att.some(a=>a.date===day&&a.membership_id===pass?.id)),canRead=staff||m.role==='coach'||access.active;
  const ws=canRead?await rows('gym_workouts',q=>{q=q.or(`date.gte.${addDays(day,-30)},date.eq.${viewDate}`);return (all?q:q.lte('release_at',now().toISOString())).order('date',{ascending:false}).limit(1000);}):[];
  if(canRead&&!ws.some(w=>w.date===viewDate)){const selected=await rows('gym_workouts',q=>{q=q.eq('date',viewDate);return all?q:q.lte('release_at',now().toISOString());});ws.push(...selected);}
  const [ownRecords,selectedRecords,rms,posts,comments,joins,notes,passes,events,attAll]=await Promise.all([
   rows('gym_records',q=>q.eq('user_id',m.id).order('date',{ascending:false}).limit(1000)),
   canRead?rows('gym_records',q=>q.eq('date',viewDate).limit(1000)):[],
   rows('gym_rms',q=>q.eq('user_id',m.id).order('body->>date',{ascending:false}).limit(1000)),canRead?rows('gym_posts',q=>q.order('created_at',{ascending:false}).limit(200)):[],
   canRead?rows('gym_comments',q=>q.order('created_at').limit(1000)):[],canRead?rows('gym_post_joins',q=>q.limit(1000)):[],
   staff?rows('gym_member_notes'):[],staff?rows('gym_memberships'):[],staff?rows('gym_membership_events',q=>q.order('created_at',{ascending:false}).limit(500)):[],staff?rows('gym_attendance',q=>q.order('date',{ascending:false}).limit(2000)):[]
  ]);
  if(canRead){const extras=await rows('gym_posts',q=>q.eq('banner_pinned',true).eq('category','운동 번개').order('starts_at').limit(100));const linked=url.searchParams.get('post');if(uuid(linked)){const post=await one('gym_posts','id',linked);if(post)extras.push(post);}const merged=[...new Map([...posts,...extras].map(p=>[p.id,p])).values()];posts.splice(0,posts.length,...merged.filter(p=>{const author=memberRows.find(m=>m.id===p.author_id);return staff||author?.disclosure_consent!==false||p.author_id===m.id;}));}
  const pointBalances=staff?await rows('gym_point_accounts'):[];
  const rankingOwners=new Set(memberRows.filter(x=>x.status==='approved'&&x.disclosure_consent===true).map(x=>x.id));
  const records=[...new Map([...ownRecords,...selectedRecords].map(r=>[r.id,r])).values()],names=new Map(memberRows.map(x=>[x.id,x.name])),rank=new Map(),avatars=new Map();
  // Ranking preference is not derived from JWT or editable names.
  if(canRead){for(const p of await rows('gym_preferences',q=>q.limit(1000))){rank.set(p.user_id,p.body.rank!==false);avatars.set(p.user_id,avatarEmoji(p.body.avatarEmoji));}}
  const accRows=canRead?await rows('gym_acc_workouts',q=>{q=q.or(`date.gte.${addDays(day,-30)},date.eq.${viewDate}`);return (hasPermission(m,'acc.read')&&url.searchParams.get('view')!=='member'?q:q.lte('release_at',now().toISOString())).order('date',{ascending:false}).limit(1000);}):[];
  return {named:await named.snapshot(m),privacyReviewRequired:m.privacy_version!==PRIVACY_VERSION,points:pointData,accWorkouts:Object.fromEntries(accRows.map(w=>[w.date,w.body])),videoCategories:await videoCategories(),viewer:m,...rev,memberView:!all,shared:true,releaseTime:await setting('releaseTime','22:00'),banner:await setting('banner',DEFAULT_BANNER),rmCatalogue:cat,rmCategories:await setting('rmCategories',RM_CATEGORIES),library:lib,
   calendar:cal,membership:pass,membershipState:access,memberships:passes,membershipEvents:events.map(e=>({...e,body:JSON.stringify(e.body)})),memberAttendance:attAll,attendance:att.map(a=>a.date),
   recordMembers:hasPermission(m,'records.create')||hasPermission(m,'records.update')?memberRows.filter(x=>x.status==='approved').map(x=>({id:x.id,name:x.name,status:x.status})):[],
   members:staff?memberRows.map(x=>({...x,pointBalance:Number(pointBalances.find(a=>a.user_id===x.id)?.balance||0),avatarEmoji:avatars.get(x.id)||avatarEmoji(),note:notes.find(n=>n.user_id===x.id)?.note||''})):[],
   workouts:Object.fromEntries(ws.map(w=>[w.key,w.body])),publishedDates:[...new Set(ws.filter(w=>Date.parse(w.release_at)<=+now()).map(w=>w.date))],
   notices:canRead?noticeRows.map(n=>({...n,category:'공지사항',author:names.get(n.author_id)||'운영자',serverNotice:true,date:kstDate(new Date(n.created_at)),comments:[],joined:[]})):[],
   records:records.filter(r=>staff||r.user_id===m.id||memberRows.find(x=>x.id===r.user_id)?.disclosure_consent!==false).map(r=>({...r.body,id:r.id,memberId:r.user_id,name:names.get(r.user_id)||'회원',avatarEmoji:avatars.get(r.user_id)||avatarEmoji(),rank:rank.get(r.user_id)!==false&&rankingOwners.has(r.user_id)})),
   photos:canRead?await media.list(viewDate,posts.map(p=>p.id),noticeRows.map(n=>n.id),m):[],
   rms:rms.map(r=>({...r.body,id:r.id,memberId:r.user_id})),preferences:prefs?.body||{},
   posts:posts.map(p=>({...p,viewerJoined:joins.some(j=>j.post_id===p.id&&j.user_id===m.id),joinAccess:participationAccess({viewer:m,author:memberRows.find(x=>x.id===p.author_id),post:p,pass,today:day,attendedToday:att.some(a=>a.date===day&&a.membership_id===pass?.id)}),authorId:p.author_id,author:names.get(p.author_id)||'회원',date:kstDate(new Date(p.created_at)),joined:[],joinedIds:joins.filter(j=>j.post_id===p.id&&memberRows.find(x=>x.id===j.user_id)?.disclosure_consent!==false).map(j=>j.user_id),joinedNames:Object.fromEntries(joins.filter(j=>j.post_id===p.id&&memberRows.find(x=>x.id===j.user_id)?.disclosure_consent!==false).map(j=>[j.user_id,names.get(j.user_id)||'회원'])),comments:comments.filter(c=>c.post_id===p.id&&memberRows.find(x=>x.id===c.author_id)?.disclosure_consent!==false).map(c=>({...c,authorId:c.author_id,author:names.get(c.author_id)||'회원'}))})),
   tv:hasPermission(m,'tv')?await tvSettings():undefined,push:await push.status(m),historyLimit:1000
  };
 }
 async function route(req,path,url,b){
  if(path==='/api/health')return {ok:true,backend:'supabase',serverNow:now().toISOString()};
  if(path==='/api/push/dispatch'||path.startsWith('/api/push/test-access/'))return push.publicRoute(req,path,b);
  if(['/api/tv/login','/api/tv/logout','/api/tv/bootstrap','/api/tv/heartbeat'].includes(path))return tv(req,path,b);
  const m=await member(req);
  if(path==='/api/bootstrap'&&m.status==='approved')await media.cleanup();
  if(path==='/api/account/delete')return account.withdraw(m,b);
  if(path==='/api/privacy/accept'){if(b.version!==PRIVACY_VERSION||b.ageOver14!==true||typeof b.disclosure!=='boolean')bad('만 14세 이상 확인과 개인정보 안내 동의가 필요해요.');return result(db.rpc('onoff_privacy_accept',{actor:m.id,p:{version:PRIVACY_VERSION,ageOver14:true,disclosure:b.disclosure}}));}
  if(path==='/api/revision')return revision(m);
  if(path==='/api/bootstrap')return bootstrap(m,url);
  if(path==='/api/profile')return commit(m.id,'profile',{name:text(b.name,2,30,'실명')});
  approved(m);
  if((path==='/api/posts'||path==='/api/meetups'||(path==='/api/posts/comment'))&&m.disclosure_consent===false)bad('개인설정에서 회원 간 공개에 동의한 뒤 이용해주세요.',403);
  if(path.startsWith('/api/named-wods/'))return named.route(m,path,b);
  if(path==='/api/rm/comparison'){if(typeof b.movementId!=='string'||b.movementId.length>100)bad('종목을 확인해주세요.');return result(db.rpc('onoff_rm_comparison',{actor:m.id,movement_id:b.movementId}));}
  if(path==='/api/members/delete'){admin(m);if(!uuid(b.id)||!uuid(b.requestId)||b.id===m.id||b.confirmed!==true||typeof b.confirmedName!=='string'||b.confirmedName.length>40)bad('삭제할 회원과 확인 내용을 확인해주세요.');return account.removeByAdmin(m,b);}
  if(path==='/api/points'||path.startsWith('/api/points/'))return points.route(m,path,b);
  if(path.startsWith('/api/photos/')){if(path==='/api/photos/attach'&&(!normalizeDate(b.date)||b.date>kstDate(now())||!['ALL','B/T','WOD'].includes(b.program)||b.session&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.session)))bad('사진 날짜·수업을 확인해주세요.');return media.route(m,path,b);}
  if(path==='/api/attendance'){const day=kstDate(now()),cal=await calendar(),ws=await rows('gym_workouts',q=>q.eq('date',day));if(!workoutSchedule(day,ws.map(w=>w.body),cal.dates).length)bad('휴강일에는 출석할 수 없어요. 특별 수업이 등록되면 출석할 수 있습니다.',403);return commit(m.id,'attendance');}
  if(path==='/api/preferences'){
   const p={};if('showMembershipWallet' in b){if(!['admin','coach'].includes(m.role))bad('운영자·코치만 회원카드 표시를 설정할 수 있어요.',403);if(typeof b.showMembershipWallet!=='boolean')bad('회원카드·쿠폰 표시 설정을 확인해주세요.');p.showMembershipWallet=b.showMembershipWallet;}if('pushOnboardingSeen' in b){if(b.pushOnboardingSeen!==true)bad('알림 안내 상태를 확인해주세요.');p.pushOnboardingSeen=true;}if('avatarEmoji' in b){if(!validAvatar(b.avatarEmoji))bad('프로필 이모지를 목록에서 선택해주세요.');p.avatarEmoji=b.avatarEmoji;}if('rank' in b){if(typeof b.rank!=='boolean')bad('순위 설정을 확인해주세요.');p.rank=b.rank;}if('rmSelection' in b){const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE);if(!Array.isArray(b.rmSelection)||b.rmSelection.length>200||b.rmSelection.some(id=>!cat.some(m=>m.id===id)))bad('1RM 종목을 확인해주세요.');p.rmSelection=[...new Set(b.rmSelection)];}return commit(m.id,'preferences',p);
  }
  if(path==='/api/records/delete'){if(!uuid(b.id))bad('기록을 확인해주세요.');return result(db.rpc('onoff_delete_record',{actor:m.id,record_id:b.id}));}
  if(path==='/api/records'){
   const list=b.records;if(!Array.isArray(list)||list.length<1||list.length>200)bad('기록 목록을 확인해주세요.');if(list.length>1&&!hasPermission(m,'records.create')&&!hasPermission(m,'records.update'))admin(m);
   const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),cache=new Map(),clean=[];
   for(const r of list){
    const id=r.id||crypto.randomUUID(),memberId=r.memberId||m.id;if(!uuid(id)||!uuid(memberId))bad('회원과 기록 ID를 확인해주세요.');let prior;if(memberId!==m.id){prior=await one('gym_records','id',id);permit(m,prior?'records.update':'records.create');}
    if(!normalizeDate(r.date)||r.date>kstDate(now())||!['B/T','WOD'].includes(r.program)||!/^S[1-9]\d?$/.test(r.section))bad('기록 날짜와 수업을 확인해주세요.');
    const key=r.date+'_'+r.program;if(!cache.has(key))cache.set(key,await one('gym_workouts','key',key));const w=cache.get(key),sec=w?.body.sections?.[+r.section.slice(1)-1];
    if(!sec?.record||Date.parse(w.release_at)>+now())bad('공개된 수업의 기록 구간을 선택해주세요.');
    if(r.session&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.session))bad('수업 시간을 확인해주세요.');
    const movement=sec.kind==='1RM'&&(sec.movements?.length??(sec.movement?1:0))!==1?'':sec.movement||sec.movements?.[0]||'',rm=findRmMovement(cat,movement),item={id,memberId,date:r.date,program:r.program,section:r.section,session:r.session||'',kind:sec.kind,movement,movements:sec.movements||[],movementId:rm?.id,note:typeof r.note==='string'?text(r.note,0,150,'메모'):'',writer:m.role};
    if(prior===undefined&&(!r.result||r.result.condition==='unspecified'))prior=await one('gym_records','id',id);try{Object.assign(item,canonicalRecordPayload(sec,r,prior?.user_id===memberId&&prior.date===r.date&&prior.program===r.program&&prior.section===r.section?prior.body:null));}catch(e){bad(e.message);}
    clean.push(item);
   }
   return commit(m.id,'records',{records:clean});
  }
  if(path==='/api/rms/delete'){if(!uuid(b.id))bad('1RM 기록을 확인해주세요.');const r=await one('gym_rms','id',b.id);if(!r||r.user_id!==m.id)bad('본인의 1RM 기록만 삭제할 수 있어요.',403);return commit(m.id,'rm-delete',{id:b.id});}
  if(path==='/api/rms'){
   if(b.id&&!uuid(b.id))bad('1RM 기록을 확인해주세요.');const existing=b.id?await one('gym_rms','id',b.id):null;if(b.id&&(!existing||existing.user_id!==m.id))bad('본인의 1RM 기록만 수정할 수 있어요.',403);
   const cat=await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),mov=findRmMovement(cat,b.movementId||b.movement),oldMov=existing?findRmMovement(cat,existing.body.movementId||existing.body.movement):null;
   if(!mov||(!mov.active&&mov.id!==oldMov?.id)||!Number.isFinite(b.lbs)||b.lbs<=0||b.lbs>6614||!normalizeDate(b.date)||b.date>kstDate(now()))bad('1RM 종목·중량·날짜를 확인해주세요.');
   if(existing?.source&&(b.date!==existing.body.date||mov.id!==oldMov?.id))bad('수업에서 연결된 동작과 날짜는 유지해주세요.');
   const body={id:existing?.id||crypto.randomUUID(),memberId:m.id,movementId:mov.id,movement:mov.name,lbs:b.lbs,date:b.date};if(existing?.source)body.source=existing.source;return commit(m.id,existing?'rm-update':'rm',body);
  }
  if(path==='/api/community/read'){if(!uuid(b.id)||!['post','notice'].includes(b.kind))bad('읽은 게시글을 확인해주세요.');const item=await one(b.kind==='notice'?'gym_notices':'gym_posts','id',b.id);if(!item)bad('게시글을 찾을 수 없어요.',404);return commit(m.id,'community-read',{id:b.id,kind:b.kind});}

  if(path==='/api/meetups'){
   if(!uuid(b.id)||b.category&&b.category!=='운동 번개'||typeof b.startsAt!=='string'||b.startsAt.length>40||!Number.isFinite(Date.parse(b.startsAt))||new Date(b.startsAt).getUTCFullYear()<1900||'bannerPinned' in b&&typeof b.bannerPinned!=='boolean'||'sendPush' in b&&typeof b.sendPush!=='boolean')bad('운동 시작 날짜·시간을 확인해주세요.');
   const ids=b.photoIds||[];if(!Array.isArray(ids)||ids.length>3||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length)bad('첨부 사진을 확인해주세요.');
   return result(db.rpc('onoff_meetup_create',{actor:m.id,p:{id:b.id,title:text(b.title,1,80,'제목'),body:text(b.body,1,3000,'내용'),startsAt:new Date(b.startsAt).toISOString(),bannerPinned:b.bannerPinned===true,sendPush:b.sendPush===true,photoIds:ids}}));
  }
  if(path==='/api/meetups/pin'){if(!uuid(b.id)||typeof b.pinned!=='boolean')bad('운동 번개 고정 요청을 확인해주세요.');return result(db.rpc('onoff_meetup_pin',{actor:m.id,post_id:b.id,pinned:b.pinned}));}
  if(path==='/api/posts'){if(b.photoIds?.length){if(!uuid(b.id))bad('게시글 ID를 확인해주세요.');return result(db.rpc('onoff_attach_photos',{actor:m.id,p:{...b,kind:'community',title:text(b.title,1,80,'제목'),body:text(b.body,1,3000,'내용')}}));}if(!['운동 번개','공동구매','자유글'].includes(b.category))bad('말머리를 확인해주세요.');return commit(m.id,'post',{category:b.category,title:text(b.title,1,80,'제목'),body:text(b.body,1,3000,'내용')});}
  if(path==='/api/posts/access'){if(!uuid(b.id))bad('게시글을 확인해주세요.');return joinAccess(m,b.id);}
  if(path==='/api/posts/join'){if(!uuid(b.id)||typeof b.joined!=='boolean')bad('게시글과 참여 상태를 확인해주세요.');if(b.joined){const access=await joinAccess(m,b.id);if(!access.allowed)bad(access.message,403,{joinAccess:access});}try{return await result(db.rpc('onoff_post_participation',{actor:m.id,target_post:b.id,joined:b.joined}));}catch(error){if(error.status===403&&b.joined){const access=await joinAccess(m,b.id);if(!access.allowed)bad(access.message,403,{joinAccess:access});bad('참여 조건이 변경됐어요. 상태를 다시 확인해주세요.',409);}throw error;}}
  if(['/api/posts/delete','/api/posts/comment'].includes(path)){if(!uuid(b.id))bad('게시글을 확인해주세요.');if(!path.endsWith('delete')){const post=await one('gym_posts','id',b.id);if(post){const author=await one('gym_members','id',post.author_id);if(author?.disclosure_consent===false)bad('공개가 중지된 게시글입니다.',403);}}const comment=path.endsWith('comment');if(b.requestId&&!uuid(b.requestId))bad('댓글 요청을 확인해주세요.');if('joined' in b&&typeof b.joined!=='boolean')bad('참여 상태를 확인해주세요.');const value=await commit(m.id,path.endsWith('delete')?'post-delete':path.endsWith('join')?'join':'comment',{id:b.id,...(comment?{text:text(b.text,1,300,'댓글'),commentId:b.requestId||crypto.randomUUID()}:'joined' in b?{joined:b.joined}:{})});if(path.endsWith('delete'))await media.cleanup();return value;}
  if(path.startsWith('/api/push/'))return push.memberRoute(m,path,b);
  if(path==='/api/acc'){if(!normalizeDate(b.date))bad('날짜를 확인해주세요.');if(b.action==='delete'){permit(m,'acc.delete');return result(db.rpc('onoff_acc',{actor:m.id,target_date:b.date,p:{action:'delete'}}));}const existing=await one('gym_acc_workouts','date',b.date);permit(m,existing?'acc.update':'acc.create');const movements=b.movements||[];if(!Array.isArray(movements)||movements.length>30||movements.some(x=>typeof x!=='string'||!x.trim()||x.length>80))bad('관련 동작을 확인해주세요.');const overviewId=b.overview===undefined?(existing?.body?.overviewId||''):b.overview?youtubeId(b.overview):'';if(overviewId===null)bad('유튜브 주소를 확인해주세요.');return result(db.rpc('onoff_acc',{actor:m.id,target_date:b.date,p:{text:text(b.text,1,5000,'운동 내용'),movements:movements.map(x=>x.trim()),overviewId}}));}
  if(path==='/api/video-categories'){permit(m,'videos');const actions={add:'category-add',edit:'category-edit',delete:'category-delete'},action=actions[b.action];if(!action)bad('분류 요청을 확인해주세요.');return result(db.rpc('onoff_video_manage',{actor:m.id,p:{action,id:b.id,label:b.action==='delete'?undefined:text(b.label,1,40,'분류 이름'),targetId:b.targetId}}));}
  if(path==='/api/rm-categories'){permit(m,'rm');if(!['add','edit','delete'].includes(b.action)||b.action!=='add'&&(typeof b.id!=='string'||!b.id||b.id.length>100)||b.action==='delete'&&(typeof b.targetId!=='string'||!b.targetId||b.targetId.length>100))bad('분류 요청을 확인해주세요.');return result(db.rpc('onoff_rm_categories',{actor:m.id,p:{action:b.action,id:b.id,label:b.action==='delete'?undefined:text(b.label,1,40,'분류 이름'),targetId:b.targetId}}));}
  if(path==='/api/movements/delete'){permit(m,'videos');return result(db.rpc('onoff_video_manage',{actor:m.id,p:{action:'movement-delete',name:text(b.name,2,80,'동작 이름')}}));}
  const permission={'/api/tv/status':'tv','/api/tv/admin':'tv','/api/workouts/delete':'workouts.delete','/api/settings':'release','/api/banner':'banner','/api/rm-catalogue':'rm','/api/rm-catalogue/delete':'rm','/api/movements':'videos','/api/notices':'notices'}[path];if(permission)permit(m,permission);else if(path!=='/api/workouts')admin(m);
  if(path==='/api/storage-usage')return result(db.rpc('onoff_storage_usage',{actor:m.id}));
  if(path==='/api/tv/status')return tvSettings();
  if(path==='/api/tv/admin'){if(m.role!=='admin'&&(b.password||b.revoke))bad('TV 인증 관리는 운영자만 할 수 있어요.',403);let preferences;try{preferences=normalizeTvPreferences(b);}catch(e){bad(e.message);}const p={preferences,revoke:b.revoke===true};if(b.password){if(!/^\d{4}$/.test(b.password))bad('TV 암호는 숫자 4자리예요.');const salt=crypto.randomUUID();p.password={salt,hash:await tvPassword(b.password,salt),format:'pin4'};}await commit(m.id,'tv-admin',p);return {ok:true,...await tvSettings()};}
  if(path==='/api/member-name'||path==='/api/member-note'||path==='/api/members'){if(!uuid(b.id)||!await one('gym_members','id',b.id))bad('회원을 찾을 수 없어요.',404);if(path.endsWith('member-name'))return commit(m.id,'member-name',{id:b.id,name:text(b.name,2,30,'실명')});if(path.endsWith('member-note'))return commit(m.id,'member-note',{id:b.id,note:text(b.note,0,500,'구분 메모')});if(!['admin','coach','member'].includes(b.role)||!['approved','pending','suspended'].includes(b.status))bad('회원 권한을 확인해주세요.');const permissions=b.coach_permissions||[];if(!Array.isArray(permissions)||permissions.some(k=>!COACH_PERMISSIONS.some(([key])=>key===k)))bad('코치 권한을 확인해주세요.');return commit(m.id,'members',{id:b.id,role:b.role,status:b.status,coach_permissions:b.role==='coach'?[...new Set(permissions)]:[]});}
  if(path==='/api/membership/history/delete'){if(!uuid(b.id)||!uuid(b.eventId)||b.confirmed!==true)bad('회원과 관리 이력 삭제를 확인해주세요.');return result(db.rpc('onoff_membership_history_delete',{actor:m.id,target_member:b.id,event_id:b.eventId}));}
  if(path==='/api/membership/delete'){if(!uuid(b.id)||!uuid(b.passId))bad('회원권을 확인해주세요.');const old=await one('gym_memberships','user_id',b.id);if(!old||old.id!==b.passId||!Number.isInteger(b.revision)||old.revision!==b.revision)bad('회원권이 변경됐어요. 다시 확인해주세요.',409);return commit(m.id,'membership-delete',{id:b.id,passId:old.id,revision:old.revision});}
  if(path==='/api/membership'){if(!uuid(b.id))bad('회원을 확인해주세요.');const old=await one('gym_memberships','user_id',b.id);let pass;try{pass=changeMembership(old,b,kstDate(now()));}catch(e){bad(e.message);}return commit(m.id,'membership',{id:b.id,action:b.action,pass,revision:old?.revision??-1,reason:String(b.reason||'').slice(0,200)});}
  if(path==='/api/attendance/cancel'){if(!uuid(b.id)||!normalizeDate(b.date)||b.date>kstDate(now()))bad('회원과 출석 날짜를 확인해주세요.');return commit(m.id,'attendance-cancel',{id:b.id,date:b.date,reason:text(b.reason,1,200,'취소 사유')});}
  if(path==='/api/workouts/delete'){if(!normalizeDate(b.date)||!['B/T','WOD'].includes(b.program))bad('삭제할 수업을 확인해주세요.');return result(db.rpc('onoff_delete_workout',{actor:m.id,target_date:b.date,target_program:b.program}));}
  if(path==='/api/workouts'){if(!Array.isArray(b.workouts))bad('수업 목록을 확인해주세요.');for(const w of b.workouts){const old=await one('gym_workouts','key',w.date+'_'+w.program);permit(m,old?'workouts.update':'workouts.create');}const [lib,cal]=await Promise.all([library(),calendar()]),v=validateWorkouts(b.workouts,lib.map(m=>m.name),cal.dates);if(v.errors.length)bad(v.errors.join('\n'));await commit(m.id,'workouts',{workouts:v.workouts,overwrite:b.overwrite===true});return {ok:true,count:v.workouts.length};}
  if(path==='/api/settings'){if(typeof b.releaseTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.releaseTime))bad('공개 시간을 확인해주세요.');await commit(m.id,'settings',{releaseTime:b.releaseTime});return {ok:true,releaseTime:b.releaseTime};}
  if(path==='/api/banner'){if(!validBanner(b))bad('공지 문구·색상·노출 여부를 확인해주세요.');const banner={text:b.text.trim(),color:b.color,enabled:b.enabled};await commit(m.id,'setting',{key:'banner',value:banner});return {ok:true,banner};}
  if(path==='/api/rm-catalogue/delete'){if(typeof b.id!=='string'||!b.id||b.id.length>100)bad('종목을 확인해주세요.');return result(db.rpc('onoff_rm_archive',{actor:m.id,item_id:b.id}));}
  if(path==='/api/rm-catalogue'){let value;try{value=updateRmCatalogue(await setting('rmCatalogue',DEFAULT_RM_CATALOGUE),b,()=>crypto.randomUUID(),await setting('rmCategories',RM_CATEGORIES));}catch(e){bad(e.message);}await commit(m.id,'setting',{key:'rmCatalogue',value:value.catalogue});return {ok:true,...value};}
  if(path==='/api/movements'){const name=text(b.name,2,80,'동작 이름'),videoId=b.url?youtubeId(b.url):'';if(videoId===null)bad('유튜브 주소를 확인해주세요.');const categories=await videoCategories(),categoryId=b.categoryId||resolveVideoCategory(videoCategory(name,await setting('rmCatalogue',DEFAULT_RM_CATALOGUE)),categories,await setting('videoCategoryRedirects',{}));if(!categories.some(([id])=>id===categoryId))bad('분류를 선택해주세요.');let originalName=name;if(b.originalName){originalName=text(b.originalName,2,80,'기존 동작 이름');const items=await library(),source=findVideoMovement(items,originalName),target=findVideoMovement(items,name);if(!source)bad('수정할 동작을 찾을 수 없어요.',404);originalName=source.name;if(target&&target.name!==originalName)bad('이미 등록된 동작 이름이에요.',409);}return result(db.rpc('onoff_video_save',{actor:m.id,p:{originalName,name,videoId,categoryId,notes:text(b.notes,0,1000,'설명')}}));}
  if(path==='/api/notices'){if(b.id&&!uuid(b.id))bad('공지를 확인해주세요.');if(b.action==='delete'){const value=await commit(m.id,'notices',{action:'delete',id:b.id});await media.cleanup();return value;}if(typeof b.pinned!=='boolean')bad('상단 고정 여부를 확인해주세요.');if(b.sendPush===true)permit(m,'push');const notice={id:b.id||crypto.randomUUID(),title:text(b.title,1,100,'제목'),body:text(b.body,1,5000,'내용'),pinned:b.pinned};await result(db.rpc('onoff_save_notice_photos',{actor:m.id,p:{...notice,photoIds:b.photoIds||[]}}));if(b.sendPush===true){permit(m,'push');await push.enqueue({id:'notice:'+notice.id+':'+crypto.randomUUID(),kind:'notices',payload:{title:notice.title,body:notice.body.slice(0,140),url:'/Onoffgym/#community',tag:'notice:'+notice.id}});}return {ok:true};}
  if(path==='/api/holidays/sync')return {ok:true,calendar:await calendar(true)};
  bad('요청을 찾을 수 없어요.',404);
 }
 return async req=>{
  const origin=req.headers.get('Origin'),allowed=!origin||ORIGINS.has(origin),cors={'Access-Control-Allow-Origin':allowed&&origin?origin:'https://nuclearstark.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-onoff-tv-token,x-onoff-push-test','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
  try{
   if(!allowed)bad('허용된 앱에서 접속해주세요.',403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   const url=new URL(req.url),match=url.pathname.match(/\/api\/[^?]+$/),path=match?.[0];if(!path)bad('요청을 찾을 수 없어요.',404);
   const get=new Set(['/api/points','/api/points/admin','/api/health','/api/bootstrap','/api/revision','/api/tv/bootstrap','/api/tv/status','/api/storage-usage','/api/push/test-access/config','/api/push/test-access/status','/api/push/history']);if(req.method!==(get.has(path)?'GET':'POST'))bad('지원하지 않는 요청 방식이에요.',405);
   let b={};if(req.method==='POST'){if(!req.headers.get('Content-Type')?.startsWith('application/json'))bad('JSON 요청만 사용할 수 있어요.',415);const raw=await req.text();if(raw.length>2_000_000)bad('요청이 너무 커요.',413);try{b=JSON.parse(raw);}catch{bad('요청 형식을 확인해주세요.');}if(!b||typeof b!=='object'||Array.isArray(b))bad('요청 형식을 확인해주세요.');}
   return response(await route(req,path,url,b));
  }catch(e){if(!e.status)console.error('ONOFF request failed',e.name);return response({error:e.status?e.message:'서버 연결을 확인해주세요.',...(e.status&&e.joinAccess?{joinAccess:e.joinAccess}:{})},e.status||503);}
 };
}
