import {photoPreviewPath} from './media-service.js';
const photoPaths=paths=>[...new Set(paths.flatMap(path=>[path,photoPreviewPath(path)]))];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function createAccountService(db,{reauthenticate}={}){
 return {async removeByAdmin(member,b){
  if(member.role!=='admin'||member.status!=='approved'||member.id===b.id)fail('운영자 권한이 필요해요.',403);
  const args={actor:member.id,target:b.id,request_id:b.requestId};
  const prepared=await db.rpc('onoff_account_delete_prepare',{...args,confirmed_name:b.confirmedName});
  if(prepared.error)fail(prepared.error.code==='42501'?'계정 삭제 권한을 확인해주세요.':prepared.error.code==='23514'?'마지막 운영자는 삭제할 수 없어요.':'회원 이름과 삭제 요청을 확인해주세요.',prepared.error.code==='42501'?403:409);
  if(!prepared.data?.already){const paths=photoPaths(prepared.data?.paths||[]);if(paths.length){const bucket=db.storage?.from('onoff-private-photos');if(!bucket)fail('사진 삭제 연결을 확인해주세요.',503);for(let i=0;i<paths.length;i+=100){const removed=await bucket.remove(paths.slice(i,i+100));if(removed.error)fail('사진 삭제를 완료하지 못했어요. 계정 삭제를 재시도해주세요.',503);}}
   const deleted=await db.auth.admin.deleteUser(b.id,false);if(deleted.error)fail('계정 삭제를 완료하지 못했어요. 재시도해주세요.',503);
  }
  const completed=await db.rpc('onoff_account_delete_complete',args);if(completed.error)fail('계정 삭제 완료 확인을 재시도해주세요.',503);return {ok:true,deleted:true};
 },async withdraw(member,b){
  if(b.confirmed!==true||typeof b.password!=='string'||!b.password||b.password.length>128)fail('탈퇴 동의와 현재 비밀번호를 확인해주세요.');
  if(!member.email||!reauthenticate)fail('이메일 로그인을 다시 확인해주세요.',401);
  const session=await reauthenticate(member.email,b.password);
  if(!session||session.user?.id!==member.id||!session.accessToken)fail('현재 비밀번호를 확인해주세요.',403);
  const prepared=await db.rpc('onoff_withdraw_prepare',{actor:member.id});
  if(prepared.error)fail(prepared.error.code==='23514'?'마지막 운영자는 다른 승인된 운영자에게 권한을 넘긴 뒤 탈퇴할 수 있어요.':'탈퇴 요청을 저장하지 못했어요. 다시 시도해주세요.',prepared.error.code==='23514'?409:503);
  if(db.storage?.from){const photos=await db.from('gym_photos').select('path').eq('owner_id',member.id);if(photos.error)fail('사진 삭제 준비를 재시도해주세요.',503);const paths=photoPaths((photos.data||[]).map(x=>x.path));for(let i=0;i<paths.length;i+=100){const removed=await db.storage.from('onoff-private-photos').remove(paths.slice(i,i+100));if(removed.error)fail('사진 삭제를 재시도해주세요.',503);}}
  const revoked=await db.auth.admin.signOut(session.accessToken,'global');
  if(revoked.error)fail('로그인 연결 해제를 완료하지 못했어요. 다시 로그인한 뒤 탈퇴를 재시도해주세요.',503);
  const removed=await db.auth.admin.deleteUser(member.id,false);
  if(removed.error)fail('계정 삭제를 완료하지 못했어요. 다시 로그인한 뒤 탈퇴를 재시도해주세요.',503);
  return {ok:true,deleted:true};
 }};
}
