import {pushConfigured,pushDigest} from './push.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function pushAdminRequest(req,env,member,now){
 const path=new URL(req.url).pathname;if(!['/api/push/compose','/api/push/history'].includes(path))return null;
 if(member.role!=='admin'||member.status!=='approved')fail('운영자 권한이 필요해요.',403);
 if(path.endsWith('/history')&&req.method==='GET'){
  const rows=(await env.DB.prepare("SELECT e.id,e.kind,e.payload,e.created_at,COUNT(d.subscription_id) AS total,SUM(CASE WHEN d.status='sent' THEN 1 ELSE 0 END) AS sent,SUM(CASE WHEN d.status IN ('failed','expired') THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN d.status='sending' THEN 1 ELSE 0 END) AS pending FROM (SELECT * FROM gym_push_events ORDER BY created_at DESC LIMIT 30) e LEFT JOIN gym_push_deliveries d ON d.event_id=e.id AND d.status<>'skipped' GROUP BY e.id ORDER BY e.created_at DESC").all()).results;
  return {jobs:rows.map(r=>{const p=JSON.parse(r.payload);return {...r,title:p.title,body:p.body,payload:undefined,due_at:r.created_at}})};
 }
 if(path.endsWith('/compose')&&req.method==='POST'){
  if(!pushConfigured(env))fail('이 미리보기 서버에는 알림이 연결되지 않았어요. GitHub 배포 앱에서 시험해주세요.',503);
  const b=await req.json(),title=typeof b.title==='string'?b.title.trim():'',body=typeof b.body==='string'?b.body.trim():'';
  if(!title||title.length>80||!body||body.length>300||!['test','all'].includes(b.mode))fail('제목 1~80자, 내용 1~300자를 입력해주세요.');
  let target=null;if(b.mode==='test'){target=await pushDigest(b.endpoint||'');if(!await env.DB.prepare('SELECT id FROM gym_push_subscriptions WHERE id=? AND user_id=?').bind(target,member.id).first())fail('이 기기에서 알림을 먼저 켜주세요.',403);}
  const id=(target?'test:':'notice:')+crypto.randomUUID(),due=new Date(+now+(target?30000:0)).toISOString(),jobs=[env.DB.prepare('INSERT INTO gym_push_events(id,kind,payload,created_at) VALUES(?,?,?,?)').bind(id,target?'test':'notices',JSON.stringify({title,body,...(target?{targetId:target}:{}),url:target?'./#login':'./#community',tag:id}),due)];
  // Mark all other current subscriptions within the same transaction.
  // The queue additionally checks targetId, including subscriptions added during the delay.
  if(target)jobs.push(env.DB.prepare("INSERT INTO gym_push_deliveries(event_id,subscription_id,status,updated_at) SELECT ?,id,'skipped',? FROM gym_push_subscriptions WHERE id<>?").bind(id,now.toISOString(),target));
  await env.DB.batch(jobs);return {ok:true,queued:true,job:id};
 }
 fail('지원하지 않는 요청 방식이에요.',405);
}
