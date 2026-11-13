import {normalizeDate} from '../../../web/core.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function createWorkoutCommentsService(db){return {async route(member,path,url,body){
 if(member.status!=='approved'||member.delete_requested_at)fail('승인된 회원만 댓글을 이용할 수 있어요.',403);
 const read=path==='/api/workout-comments',source=read?Object.fromEntries(url.searchParams):body;
 const action=read?(source.action||'summary'):({'/api/workout-comments/create':'create','/api/workout-comments/update':'update','/api/workout-comments/delete':'delete'})[path];
 if(!(read?['summary','list']:['create','update','delete']).includes(action))fail('댓글 요청을 확인해주세요.');
 if(!normalizeDate(source.date)||!['B/T','WOD'].includes(source.program))fail('수업 날짜와 종류를 확인해주세요.');
 const p={action,date:normalizeDate(source.date),program:source.program};
 if(read){if(source.before!==undefined||source.beforeId!==undefined){if(action!=='list'||typeof source.before!=='string'||source.before.length>40||!Number.isFinite(Date.parse(source.before))||!uuid(source.beforeId))fail('댓글 페이지를 확인해주세요.');p.before=source.before;p.beforeId=source.beforeId;}}
 else{
  if(!uuid(source.id))fail('댓글을 확인해주세요.');p.id=source.id;
  if(action!=='delete'){if(member.disclosure_consent!==true)fail('개인설정에서 회원 간 공개에 동의한 뒤 작성해주세요.',403);if(typeof source.text!=='string'||!source.text.trim()||source.text.length>500)fail('댓글은 1~500자로 입력해주세요.');p.text=source.text.trim();}
  if(action!=='create'){if(!Number.isInteger(source.revision)||source.revision<0||source.revision>2147483647)fail('댓글 변경 상태를 확인해주세요.');p.revision=source.revision;}
 }
 const {data,error}=await db.rpc('onoff_workout_comments',{actor:member.id,p});
 if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:error.code==='40001'||error.code==='23505'?409:['22023','22007','22P02','23514'].includes(error.code)?400:503;fail(status===503?'댓글을 불러오지 못했어요. 잠시 후 다시 시도해주세요.':error.message,status);}
 return data;
}};}
