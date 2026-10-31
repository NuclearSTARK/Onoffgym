const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function createAccountService(db,{reauthenticate}={}){
 return {async withdraw(member,b){
  if(b.confirmed!==true||typeof b.password!=='string'||!b.password||b.password.length>128)fail('탈퇴 동의와 현재 비밀번호를 확인해주세요.');
  if(!member.email||!reauthenticate)fail('이메일 로그인을 다시 확인해주세요.',401);
  const session=await reauthenticate(member.email,b.password);
  if(!session||session.user?.id!==member.id||!session.accessToken)fail('현재 비밀번호를 확인해주세요.',403);
  const prepared=await db.rpc('onoff_withdraw_prepare',{actor:member.id});
  if(prepared.error)fail(prepared.error.code==='23514'?'마지막 운영자는 다른 승인된 운영자에게 권한을 넘긴 뒤 탈퇴할 수 있어요.':'탈퇴 요청을 저장하지 못했어요. 다시 시도해주세요.',prepared.error.code==='23514'?409:503);
  const revoked=await db.auth.admin.signOut(session.accessToken,'global');
  if(revoked.error)fail('로그인 연결 해제를 완료하지 못했어요. 다시 로그인한 뒤 탈퇴를 재시도해주세요.',503);
  const removed=await db.auth.admin.deleteUser(member.id,false);
  if(removed.error)fail('계정 삭제를 완료하지 못했어요. 다시 로그인한 뒤 탈퇴를 재시도해주세요.',503);
  return {ok:true,deleted:true};
 }};
}
