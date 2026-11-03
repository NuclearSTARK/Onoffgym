// Meetups use the gym's Korean time zone on every phone and desktop.
export function meetupStart(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('운동 시작 날짜와 시간을 입력해주세요.');
 const instant=new Date(date+'T'+time+':00+09:00');
 if(!Number.isFinite(+instant)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('운동 시작 날짜를 확인해주세요.');
 return instant.toISOString();
}
export function meetupMessage(instant){
 const date=new Date(instant);if(!instant||!Number.isFinite(+date))return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
 return `운동 번개 ${parts.month}/${parts.day} ${parts.hour}:${parts.minute} 함께 운동해요`;
}
export function pinnedMeetups(posts){return posts.filter(p=>p.category==='운동 번개'&&p.banner_pinned&&meetupMessage(p.starts_at)).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));}
