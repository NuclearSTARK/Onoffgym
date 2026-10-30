import {addDays,normalizeDate} from './core.js';
export function memberDays(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);}
export function periodEnd(start,months){
  if(!normalizeDate(start)||![1,3,6,12].includes(Number(months)))throw Error('시작일과 기간을 확인해주세요.');
  const d=new Date(start+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+Number(months));
  d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
  return addDays(d.toISOString().slice(0,10),-1);
}
export function membershipState(pass,today,attendedToday=false){
  if(!pass)return{status:'unregistered',label:'회원권 미등록',active:true,soon:false};
  if(pass.paused_at)return{status:'paused',label:'휴회 중',active:false,soon:false};
  if(pass.start_date>today)return{status:'scheduled',label:'이용 시작 전',active:false,soon:false};
  const days=pass.end_date?memberDays(today,pass.end_date)+1:null;
  if(attendedToday&&pass.kind==='visits'&&pass.remaining_visits===0&&(days===null||days>0))return{status:'active',label:'오늘 마지막 회차 이용 중',active:true,soon:true,days};
  if(days!==null&&days<=0||pass.kind==='visits'&&pass.remaining_visits<=0)return{status:'expired',label:'만료',active:false,soon:false,days};
  const soon=days!==null&&days<=7||pass.kind==='visits'&&pass.remaining_visits<=3;
  return{status:'active',label:soon?'만료 예정':'이용 중',active:true,soon,days};
}
export function membershipTitle(pass){return !pass?'회원권 미등록':pass.kind==='visits'?'횟수권':pass.months===12?'1년권':pass.months+'개월권';}
export function changeMembership(old,b,today){
  let p=old?{...old}:null;const action=b.action;
  if(['register','extend'].includes(action)){
    if(b.endDate&&!normalizeDate(b.endDate))throw Error('종료일을 확인해주세요.');
    if(!['period','visits'].includes(b.kind))throw Error('회원권 종류를 선택해주세요.');
    if(action==='extend'&&(!old||old.kind!==b.kind||old.paused_at))throw Error('같은 종류의 회원권을 재개한 후 연장해주세요.');
    const start=normalizeDate(b.startDate||today);if(!start)throw Error('시작일을 확인해주세요.');
    if(b.kind==='period'){
      const months=Number(b.months);if(![1,3,6,12].includes(months))throw Error('1·3·6개월 또는 1년권을 선택해주세요.');
      const base=action==='extend'&&old.end_date>=today?addDays(old.end_date,1):start;
      p={id:action==='extend'?old.id:crypto.randomUUID(),kind:'period',months,start_date:action==='extend'?old.start_date:start,end_date:normalizeDate(b.endDate)||periodEnd(base,months),total_visits:null,remaining_visits:null,paused_at:null};
    }else{
      const count=Number(b.visits);if(!Number.isInteger(count)||count<1||count>9999)throw Error('횟수는 1~9,999회로 입력해주세요.');
      if(b.endDate&&!normalizeDate(b.endDate))throw Error('유효기간을 확인해주세요.');
      p={id:action==='extend'?old.id:crypto.randomUUID(),kind:'visits',months:null,start_date:action==='extend'?old.start_date:start,end_date:b.endDate||(action==='extend'?old?.end_date:null)||null,total_visits:count+(action==='extend'?old.total_visits:0),remaining_visits:count+(action==='extend'?old.remaining_visits:0),paused_at:null};
    }
  }else if(action==='pause'){
    if(!old||!membershipState(old,today).active||old.paused_at)throw Error('이용 중인 회원권만 휴회할 수 있어요.');p.paused_at=today;
  }else if(action==='resume'){
    if(!old?.paused_at)throw Error('휴회 중인 회원권이 아니에요.');
    const days=Math.max(0,memberDays(old.paused_at,today));p.end_date=p.end_date?addDays(p.end_date,days):null;p.paused_at=null;
  }else if(action==='adjust'){
    if(!old||!String(b.reason||'').trim())throw Error('회원권과 수정 사유를 확인해주세요.');
    if(b.endDate&&!normalizeDate(b.endDate))throw Error('종료일을 확인해주세요.');
    p.end_date=b.endDate||null;
    if(p.kind==='period'&&!p.end_date)throw Error('기간권의 종료일을 입력해주세요.');
    if(p.kind==='visits'){const n=Number(b.remaining);if(!Number.isInteger(n)||n<0||n>9999)throw Error('잔여횟수를 0~9,999회로 입력해주세요.');p.remaining_visits=n;p.total_visits=Math.max(p.total_visits,n);}
  }else throw Error('처리할 회원권 작업을 선택해주세요.');
  if(p.end_date&&p.end_date<p.start_date)throw Error('종료일이 시작일보다 빠를 수 없어요.');
  return p;
}
