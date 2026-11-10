const eventTimeFormatter=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});

export function memberEventTime(value){
 if(value==null||value==='')return '시간 정보 없음';
 const date=new Date(value);
 if(!Number.isFinite(+date))return '시간 정보 없음';
 const parts=Object.fromEntries(eventTimeFormatter.formatToParts(date).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
