import {canonicalRecordPayload} from './record-schema.js';
import {normalizeDate} from './core.js';

export const LBS_PER_KG=2.2046226218;
export const toLbs=(value,unit='lbs')=>Number(value)*(unit==='kg'?LBS_PER_KG:1);
export const fromLbs=(value,unit='lbs')=>Number(value)/(unit==='kg'?LBS_PER_KG:1);
export function percentageWeight(lbs,percent,unit='lbs'){
  if(!Number.isFinite(lbs)||lbs<=0||!Number.isFinite(percent)||percent<=0||percent>150)return null;
  return fromLbs(lbs*percent/100,unit);
}

export function matchingClassRecords(records,member,context){return records.filter(r=>r.date===context.date&&r.program===context.program&&r.section===context.section&&r.memberId===member.id);}
export function findClassRecord(records,member,context){
 const matches=matchingClassRecords(records,member,context);
 if(context.session!==undefined)return matches.find(r=>(r.session||'')===context.session);
 return matches.find(r=>!r.session)||(matches.length===1?matches[0]:undefined);
}

// Validate the complete batch before returning changes. Empty rows never delete records.
export function prepareBatchRecords({rows,context,records=[],today,overwrite=false,idFactory=()=>crypto.randomUUID()}){
  const errors=[],changes=[],seen=new Set(),section=context.sectionData;
  if(!normalizeDate(context.date)||context.date>today)errors.push('오늘 또는 지난 수업의 날짜를 선택해주세요.');
  if(!['WOD','B/T'].includes(context.program)||context.session!==undefined&&context.session!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(context.session)||!/^S[1-9]\d?$/.test(context.section)||!section?.record)errors.push('기록할 수업과 구간을 선택해주세요.');
  if(!['lbs','kg'].includes(context.unit))errors.push('중량 단위를 확인해주세요.');
  if(errors.length)return{errors,changes:[]};
  const isWeight=['중량','1RM'].includes(section.kind);
  for(const row of rows){
    const value=String(row.value??'').trim(),note=String(row.note??'').trim(),member=row.member;
    if(!value){if(note)errors.push(`${member?.name||'회원'}: 메모와 함께 운동 결과를 입력해주세요.`);continue;}
    if(!member?.id||!member.name||member.status!=='approved'){errors.push('승인된 회원만 기록할 수 있어요.');continue;}
    if(seen.has(member.id)){errors.push(`${member.name}: 회원이 중복되어 있어요.`);continue;}seen.add(member.id);
    if((!row.resultInput&&value.length>120)||note.length>150){errors.push(`${member.name}: 기록 또는 메모가 너무 길어요.`);continue;}
    const matches=matchingClassRecords(records,member,context);
    const old=row.recordId?matches.find(r=>r.id===row.recordId&&(context.session===undefined||(r.session||'')===context.session)):findClassRecord(records,member,context);
    if(row.recordId&&!old){errors.push(`${member.name}: 수정할 기존 기록을 다시 확인해주세요.`);continue;}
    if(context.session===undefined&&!old&&matches.length>1){errors.push(`${member.name}: 기존 기록이 여러 개예요. 수정할 기록을 선택해주세요.`);continue;}
    let payload;try{payload=canonicalRecordPayload(section,row.resultInput?{result:row.resultInput}:isWeight?{lbs:Number.isFinite(row.canonicalLbs)?row.canonicalLbs:toLbs(value,context.unit)}:{value},old);}catch(e){errors.push(`${member.name}: ${e.message}`);continue;}
    const unchanged=old&&old.kind===section.kind&&(isWeight?Math.abs(old.lbs-payload.lbs)<0.00001:old.value===payload.value)&&(old.note||'')===note&&(old.result?JSON.stringify(old.result)===JSON.stringify(payload.result):!payload.result||payload.result.condition==='unspecified');
    if(unchanged)continue;
    if(old&&!overwrite){errors.push(`${member.name}: 기존 기록 수정 허용을 체크해주세요.`);continue;}
    const movement=section.movement||section.movements?.[0]||'';
    const record={...old,id:old?.id||idFactory(),memberId:member.id,name:member.name,date:context.date,program:context.program,session:context.session===undefined?(old?.session||''):context.session,section:context.section,kind:section.kind,movement,movements:section.movements||[],rank:old?.rank??!!row.rank,note,writer:'admin'};
    delete record.lbs;delete record.value;delete record.result;Object.assign(record,payload);
    changes.push(record);
  }
  return{errors,changes:errors.length?[]:changes};
}
