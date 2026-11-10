export const DEFAULT_REJECTION_REASON='회원 확인이 어려워 가입이 승인되지 않았습니다. 체육관 카운터에 문의해주세요.';
export function isRejectedMember(member){return member?.status==='suspended'&&!member.approved_at&&!member.delete_requested_at;}
export function memberApprovalState(member){return isRejectedMember(member)?'rejected':member?.status;}
export function memberStatusLabel(member){return ({pending:'승인 대기',approved:'승인 완료',rejected:'승인 거절',suspended:'이용 중지'})[memberApprovalState(member)]||'상태 확인 필요';}
