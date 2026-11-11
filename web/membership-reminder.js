import {addDays,kstDate,normalizeDate} from './core.js';
// Recheck against live rows immediately before provider delivery, including retries.
export function membershipReminderEligible(member,pass,payload,at=new Date()){
 const day=kstDate(at),hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(at);
 return !!(member?.status==='approved'&&!member.delete_requested_at&&pass&&pass.user_id===member.id&&payload?.membershipId===pass.id&&normalizeDate(payload.endDate)&&pass.end_date===payload.endDate&&pass.end_date===addDays(day,3)&&pass.start_date<=day&&!pass.paused_at&&(pass.kind==='period'||pass.kind==='visits'&&pass.remaining_visits>0)&&Number(hour)>=9);
}
export function membershipReminderPayload(pass){return {title:'회원권 만료 3일 전',body:`회원권이 ${pass.end_date}에 만료돼요. 이용 기간을 확인해주세요.`,url:'/Onoffgym/?membership=expiry#settings',tag:`membership-expiry:${pass.id}:${pass.end_date}`};}
