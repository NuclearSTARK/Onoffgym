import {meetupMessage,meetupLifecycle} from '../../../web/meetups.js';
import {hasPermission} from '../../../web/permissions.js';
import {base64,encryptPush,pushDigest,validateSubscription,vapidAuthorization} from '../../../worker/push.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const same=(a,b)=>{a=String(a||'');b=String(b||'');let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return diff===0;};
export function createPushService(db,{now=()=>new Date(),pushFetch=fetch,maintenance=async()=>{}}={}){
 async function result(q){const {data,error}=await q;if(error)fail(error.code==='42501'?'알림 요청 권한을 확인해주세요.':'알림 요청을 저장하지 못했어요.',error.code==='42501'?403:400);return data;}
 const one=(table,key,value)=>result(db.from(table).select('*').eq(key,value).maybeSingle());
 const setting=async(key,fallback=null)=>(await one('gym_settings','key',key))?.value??fallback;
 async function keys(){let value=await setting('pushVapid');if(value)return value;const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),candidate={publicKey:base64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateJwk:await crypto.subtle.exportKey('jwk',pair.privateKey),subject:'mailto:goffo@naver.com'};return result(db.rpc('onoff_push_keys',{candidate}));}
 async function access(req){const code=req.headers.get('X-OnOff-Push-Test')||'';if(!/^[a-f0-9]{32}$/.test(code))fail('유효한 푸시 테스트 링크 또는 코드를 입력해주세요.',401);const hash=await pushDigest(code),test=await one('gym_push_tests','hash',hash);if(!test||Date.parse(test.expires)<=+now())fail('푸시 테스트 링크가 만료됐어요.',401);return {hash,test};}
 async function subscribe(actor,testHash,b){const sub=validateSubscription(b.subscription);if(!sub)fail('알림 구독 정보를 확인해주세요.');const id=await pushDigest(sub.endpoint),preferences={notices:b.preferences?.notices!==false,workouts:b.preferences?.workouts!==false,approvals:b.preferences?.approvals!==false};await result(db.rpc('onoff_push_subscribe',{actor,test_code:testHash,sub_id:id,sub_body:sub,prefs:preferences}));return {ok:true,id};}
 async function enqueue({id,kind,payload,targetId=null,testHash=null,dueAt}){await result(db.from('gym_push_jobs').upsert({id,kind,payload,target_id:targetId,test_hash:testHash,...(dueAt?{due_at:dueAt}:{})},{onConflict:'id',ignoreDuplicates:true}));}
 async function dispatch(){
  const config=await keys(),jobs=await result(db.rpc('onoff_push_claim',{max_count:100}));let cursor=0,sent=0,failed=0;
  await Promise.all(Array.from({length:Math.min(8,jobs.length)},async()=>{for(;;){const job=jobs[cursor++];if(!job)return;let state='failed',reason=null;try{
   const current=await one('gym_push_subscriptions','id',job.subscriptionId);if(!current)continue;
   let allowed=false;if(current.user_id){const member=await one('gym_members','id',current.user_id);allowed=member?.status==='approved'&&(job.kind==='test'||current.preferences?.[job.kind]!==false);if(job.kind==='approvals'){const pending=await one('gym_members','id',job.subjectId);allowed=allowed&&member?.role==='admin'&&(pending?.status==='pending'||pending?.status==='approved'&&job.payload?.signupEvent===true);}}else if(current.test_hash){const test=await one('gym_push_tests','hash',current.test_hash);allowed=job.kind==='test'&&current.test_hash===job.testHash&&Date.parse(test?.expires)>+now();}
   let meetup=null;if(job.payload?.meetupId){meetup=await one('gym_posts','id',job.payload.meetupId);const writer=meetup?await one('gym_members','id',meetup.author_id):null;allowed=allowed&&meetup?.category==='운동 번개'&&writer?.status==='approved'&&writer?.disclosure_consent!==false&&!!meetupMessage(meetup.starts_at)&&!meetupLifecycle(meetup,now()).closed;}
   if(!allowed){state='skipped';reason=job.kind==='approvals'?'가입 알림 대상 조건이 변경되어 발송 제외':'알림 수신 조건이 변경되어 발송 제외';}else {
    const subscription=validateSubscription(current.body);if(!subscription)throw Error('Invalid subscription');
    const payload=meetup?{title:'운동 번개',body:meetupMessage(meetup.starts_at),url:'/Onoffgym/?post='+encodeURIComponent(meetup.id)+'#community',tag:'meetup:'+meetup.id}:job.kind==='approvals'?{...job.payload,url:'/Onoffgym/?approval='+encodeURIComponent(job.subjectId)+'#admin/members'}:job.payload;
    const body=await encryptPush(subscription,payload),authorization=await vapidAuthorization(subscription.endpoint,{VAPID_PUBLIC_KEY:config.publicKey,VAPID_PRIVATE_JWK:JSON.stringify(config.privateJwk),VAPID_SUBJECT:config.subject},now());
    const response=await pushFetch(subscription.endpoint,{method:'POST',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600',Urgency:job.kind==='test'?'high':'normal'},body,redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok)reason='푸시 서비스 HTTP '+response.status;
    if(response.ok){state='sent';sent++;}else if([404,410].includes(response.status)){await result(db.from('gym_push_subscriptions').delete().eq('id',job.subscriptionId));continue;}
   }
  }catch{failed++;reason='네트워크·암호화 처리 실패 또는 시간 초과';}await result(db.from('gym_push_deliveries').update({status:state,last_error:reason,updated_at:now().toISOString()}).eq('job_id',job.jobId).eq('subscription_id',job.subscriptionId));}}));
  return {ok:true,processed:jobs.length,sent,failed};
 }
 async function status(member){const config=await setting('pushVapid'),sub=await result(db.from('gym_push_subscriptions').select('id').eq('user_id',member.id).limit(1));return {configured:!!config,publicKey:config?.publicKey||'',schedulerConfigured:await setting('pushCronEnabled',false),subscribed:sub.length>0};}
 async function testStatus(hash){const jobs=await result(db.from('gym_push_jobs').select('id,due_at,created_at,payload').eq('test_hash',hash).order('created_at',{ascending:false}).limit(10)),ids=jobs.map(j=>j.id);const deliveries=ids.length?await result(db.from('gym_push_deliveries').select('job_id,status').in('job_id',ids)):[];return jobs.map(j=>({...j,status:deliveries.find(d=>d.job_id===j.id)?.status||'pending'}));}
 async function publicRoute(req,path,b){
  if(path==='/api/push/dispatch'){const secret=await setting('pushCronSecret');if(!secret||!same(req.headers.get('X-OnOff-Worker'),secret))fail('알림 발송 권한이 없어요.',401);await maintenance();return dispatch();}
  const {hash,test}=await access(req);
  if(path==='/api/push/test-access/config')return {publicKey:(await keys()).publicKey,expires:test.expires,schedulerConfigured:await setting('pushCronEnabled',false)};
  if(path==='/api/push/test-access/status')return {jobs:await testStatus(hash)};
  if(path==='/api/push/test-access/subscribe')return subscribe(null,hash,b);
  const endpoint=typeof b.endpoint==='string'?b.endpoint:'',id=await pushDigest(endpoint);
  if(path==='/api/push/test-access/unsubscribe'){await result(db.from('gym_push_subscriptions').delete().eq('id',id).eq('test_hash',hash));return {ok:true};}
  if(path==='/api/push/test-access/send'){const job=await result(db.rpc('onoff_push_compose',{actor:null,test_code:hash,p:{mode:'test',title:b.title||'ONOFF 푸시 테스트',body:b.body||'앱을 닫은 상태의 알림 수신을 확인해주세요.',subscriptionId:id,delayed:b.delayed===true}}));return {ok:true,job,queued:true};}
  fail('알림 요청을 찾을 수 없어요.',404);
 }
 async function memberRoute(member,path,b){
  if(['/api/push/compose','/api/push/history'].includes(path)){if(!hasPermission(member,'push'))fail('운영자 권한이 필요해요.',403);if(path.endsWith('/history'))return {jobs:await result(db.rpc('onoff_push_history',{actor:member.id}))};if(!['test','all'].includes(b.mode))fail('발송 대상을 확인해주세요.');if(b.mode==='test'&&!b.endpoint)fail('이 기기에서 알림을 먼저 켜주세요.');const job=await result(db.rpc('onoff_push_compose',{actor:member.id,test_code:null,p:{mode:b.mode,title:'ONOFF',body:b.body,subscriptionId:await pushDigest(b.endpoint||''),delayed:b.mode==='test'}}));return {ok:true,queued:true,job};}

  if(path==='/api/push/subscribe'){await keys();return subscribe(member.id,null,b);}
  const id=await pushDigest(typeof b.endpoint==='string'?b.endpoint:'');
  if(path==='/api/push/unsubscribe'){await result(db.from('gym_push_subscriptions').delete().eq('id',id).eq('user_id',member.id));return {ok:true};}
  if(path==='/api/push/test')fail('개인설정의 시험 발송은 종료됐어요. 별도 푸시 테스트 화면을 사용해주세요.',410);
  fail('알림 요청을 찾을 수 없어요.',404);
 }
 return {status,dispatch,enqueue,publicRoute,memberRoute};
}
