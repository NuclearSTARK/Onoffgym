import {recordCondition,structuredScore} from './record-schema.js';
// Only compare parsed values within the same date, course, section and kind.
export const recordMemberKey=r=>r.memberId||r.user_id||r.name;
export function recordScore(r,section){
 const structured=structuredScore(r,section||{kind:r.kind});if(structured!==undefined)return structured;
 const value=String(r.value??'').trim(),kind=r.kind;
 if(['중량','1RM'].includes(kind))return Number.isFinite(r.lbs)&&r.lbs>0?[r.lbs]:null;
 if(['횟수','칼로리'].includes(kind))return /^\d+$/.test(value)&&Number.isSafeInteger(+value)?[+value]:null;
 if(kind==='시간'){const m=value.match(/^(\d{1,3}):([0-5]\d)$/);return m&&+m[1]*60 + +m[2]>0?[1,-(+m[1]*60 + +m[2]),0]:null;}
 if(kind==='라운드 + 횟수'){
  const m=value.match(/^(\d+)\s*(?:R|라운드)?\s*(?:(?:\+|\s)\s*(\d+)\s*(?:회|reps?)?)?$/i);
  return m&&Number.isSafeInteger(+m[1])&&Number.isSafeInteger(+(m[2]||0))?[+m[1],+(m[2]||0)]:null;
 }
 if(kind==='완료 여부'){
  const normalized=value.toLocaleLowerCase().replace(/\s/g,'');
  if(['완료','완료함','완주','성공','done','complete','completed','finish','finished','o','○','✅'].includes(normalized))return [1];
  if(['미완료','미완주','실패','미달','dnf','incomplete','notcompleted','no','x','×','❌'].includes(normalized))return [0];
 }
 return null;
}
export const compareScores=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const difference=(b[i]||0)-(a[i]||0);if(difference)return difference;}return 0;};
export function sectionRanking(records,{date,program,section,kind,sectionData,condition='unspecified'}={}){
 const best=new Map();
 for(const record of records){
  if(record.date!==date||record.program!==program||record.section!==section||record.kind!==kind||record.rank===false||recordCondition(record)!==condition)continue;
  const score=recordScore(record,sectionData),key=recordMemberKey(record);if(!score||!key)continue;
  const old=best.get(key);if(!old||compareScores(score,old.score)<0)best.set(key,{record,score});
 }
 const rows=[...best.values()].sort((a,b)=>compareScores(a.score,b.score)||String(a.record.name||'').localeCompare(String(b.record.name||''),'ko')||String(recordMemberKey(a.record)).localeCompare(String(recordMemberKey(b.record))));
 let rank=0,previous=null;return rows.map((row,i)=>{if(!previous||compareScores(row.score,previous)!==0)rank=i+1;previous=row.score;return {...row,rank};});
}
export function rankingHint(kind){return kind==='시간'?'완료는 빠른 시간순, 타임캡은 수행량순으로 표시해요.':kind==='완료 여부'?'완료한 기록을 먼저 표시해요.':kind==='라운드 + 횟수'?'라운드가 많을수록, 같으면 추가 횟수로 비교해요.':kind==='세트별 횟수·칼로리'?'운영자가 지정한 기준으로 비교해요.':'기록이 클수록 높은 순위예요.';}
