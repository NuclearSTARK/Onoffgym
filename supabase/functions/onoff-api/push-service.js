import {base64,encryptPush,pushDigest,validateSubscription,vapidAuthorization} from '../../../worker/push.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const same=(a,b)=>{a=String(a||'');b=String(b||'');let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^(b.charCodeAt(i)||0);return diff===0;};
export function createPushService(db,{now=()=>new Date(),pushFetch=fetch}={}){
 async function result(q){const {data,error}=await q;if(error)fail(error.code==='42501'?'알림 요청 권한을 확인해주세요.':'알림 요청을 저장하지 못했어요.',error.code==='42501'?403:400);return data;}
 const one=(table,key,value)=>result(db.from(table).select('*').eq(key,value).maybeSingle());
 const setting=async(key,fallback=null)=>(await one('gym_settings','key',key))?.value??fallback;
 async function keys(){let value=await setting('pushVapid');if(value)return value;const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),candidate={publicKey:base64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateJwk:await crypto.subtle.exportKey('jwk',pair.privateKey),subject:'mailto:goffo@naver.com'};return result(db.rpc('onoff_push_keys',{candidate}));}
 async function access(req){const code=req.headers.get('X-OnOff-Push-Test')||'';if(!/^[a-f0-9]{32}$/.test(code))fail('유효한 푸시 테스트 링크 또는 코드를 입력해주세요.',401);const hash=await pushDigest(code),test=await one('gym_push_tests','hash',hash);if(!test||Date.parse(test.expires)<=+now())fail('푸시 테스트 링크가 만료됐어요.',401);return {hash,test};}
 async function subscribe(actor,testHash,b){const sub=validateSubscription(b.subscription);if(!sub)fail('알림 구독 정보를 확인해주세요.');const id=await pushDigest(sub.endpoint),preferences={notices:b.preferences?.notices!==false,workouts:b.preferences?.workouts!==false};await result(db.rpc('onoff_push_subscribe',{actor,test_code:testHash,sub_id:id,sub_body:sub,prefs:preferences}));return {ok:true,id};}
 async function enqueue({id,kind,payload,targetId=null,testHash=null,dueAt}){await result(db.from('gym_push_jobs').upsert({id,kind,payload,target_id:targetId,test_hash:testHash,...(dueAt?{due_at:dueAt}:{})},{onConflict:'id',ignoreDuplicates:true}));}
 async function dispatch(){
  const config=await keys(),jobs=await result(db.rpc('onoff_push_claim',{max_count:100}));let cursor=0,sent=0,failed=0;
  await Promise.all(Array.from({length:Math.min(8,jobs.length)},async()=>{for(;;){const job=jobs[cursor++];if(!job)return;let state='failed';try{
   const current=await one('gym_push_subscriptions','id',job.subscriptionId);if(!current)continue;
   let allowed=false;if(current.user_id){const member=await one('gym_members','id',current.user_id);allowed=member?.status==='approved'&&(job.kind==='test'||current.preferences?.[job.kind]!==false);}else if(current.test_hash){const test=await one('gym_push_tests','hash',current.test_hash);allowed=job.kind==='test'&&current.test_hash===job.testHash&&Date.parse(test?.expires)>+now();}
   if(!allowed)state='skipped';else {
    const subscription=validateSubscription(current.body);if(!subscription)throw Error('Invalid subscription');
    const body=await encryptPush(subscription,job.payload),authorization=await vapidAuthorization(subscription.endpoint,{VAPID_PUBLIC_KEY:config.publicKey,VAPID_PRIVATE_JWK:JSON.stringify(config.privateJwk),VAPID_SUBJECT:config.subject},now());
    const response=await pushFetch(subscription.endpoint,{method:'POST',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'3600',Urgency:job.kind==='test'?'high':'normal'},body,redirect:'error',signal:AbortSignal.timeout(8000)});
    if(response.ok){state='sent';sent++;}else if([404,410].includes(response.status)){await result(db.from('gym_push_subscriptions').delete().eq('id',job.subscriptionId));continue;}
   }
  }catch{failed++;}await result(db.from('gym_push_deliveries').update({status:state,updated_at:now().toISOString()}).eq('job_id',job.jobId).eq('subscription_id',job.subscriptionId));}}));
  return {ok:true,processed:jobs.length,sent,failed};
 }
 async function status(member){const config=await setting('pushVapid'),sub=await result(db.from('gym_push_subscriptions').select('id').eq('user_id',member.id).limit(1));return {configured:!!config,publicKey:config?.publicKey||'',schedulerConfigured:await setting('pushCronEnabled',false),subscribed:sub.length>0};}
 async function testStatus(hash){const jobs=await result(db.from('gym_push_jobs').select('id,due_at,created_at').eq('test_hash',hash).order('created_at',{ascending:false}).limit(10)),ids=jobs.map(j=>j.id);const deliveries=ids.length?await result(db.from('gym_push_deliveries').select('job_id,status').in('job_id',ids)):[];return jobs.map(j=>({...j,status:deliveries.find(d=>d.job_id===j.id)?.status||'pending'}));}
 async function publicRoute(req,path,b){
  if(path==='/api/push/dispatch'){const secret=await setting('pushCronSecret');if(!secret||!same(req.headers.get('X-OnOff-Worker'),secret))fail('알림 발송 권한이 없어요.',401);return dispatch();}
  const {hash,test}=await access(req);
  if(path==='/api/push/test-access/config')return {publicKey:(await keys()).publicKey,expires:test.expires,schedulerConfigured:await setting('pushCronEnabled',false)};
  if(path==='/api/push/test-access/status')return {jobs:await testStatus(hash)};
  if(path==='/api/push/test-access/subscribe')return subscribe(null,hash,b);
  const endpoint=typeof b.endpoint==='string'?b.endpoint:'',id=await pushDigest(endpoint);
  if(path==='/api/push/test-access/unsubscribe'){await result(db.from('gym_push_subscriptions').delete().eq('id',id).eq('test_hash',hash));return {ok:true};}
  if(path==='/api/push/test-access/send'){const job=await result(db.rpc('onoff_push_test_job',{actor:null,test_code:hash,sub_id:id,delayed:b.delayed===true}));return {ok:true,job,queued:true};}
  fail('알림 요청을 찾을 수 없어요.',404);
 }
 async function memberRoute(member,path,b){
  if(path==='/api/push/subscribe'){await keys();return subscribe(member.id,null,b);}
  const id=await pushDigest(typeof b.endpoint==='string'?b.endpoint:'');
  if(path==='/api/push/unsubscribe'){await result(db.from('gym_push_subscriptions').delete().eq('id',id).eq('user_id',member.id));return {ok:true};}
  if(path==='/api/push/test'){const sub=await result(db.from('gym_push_subscriptions').select('id').eq('user_id',member.id).limit(1));if(!sub.length)fail('이 기기에서 알림을 먼저 켜주세요.');const target=b.endpoint?id:sub[0].id;await result(db.rpc('onoff_push_test_job',{actor:member.id,test_code:null,sub_id:target,delayed:false}));return {ok:true,queued:true,sent:0};}
  fail('알림 요청을 찾을 수 없어요.',404);
 }
 return {status,dispatch,enqueue,publicRoute,memberRoute};
}
