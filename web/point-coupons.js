export function couponExpired(c,now=Date.now()){return !!c.expired||!!c.expires_at&&Date.parse(c.expires_at)<=now;}
export function couponUsable(c,now=Date.now()){return c.remaining>0&&!couponExpired(c,now);}
export function couponState(c,now=Date.now()){return c.remaining<=0?'사용 완료':couponExpired(c,now)?'기간 만료':'사용 가능';}
export function couponDate(value){return value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)):'기한 없음';}
