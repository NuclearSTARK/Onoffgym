// Shared by the member form, staff batch entry and the authenticated API.
export const CONDITIONS=['rx','scaled','unspecified'];
export const RX_LABEL="Rx'd";
export const conditionLabel=c=>({rx:RX_LABEL,scaled:'Scaled',unspecified:'조건 미분류'}[c]||'조건 미분류');
const complex=kind=>['세트별 횟수·칼로리','자유 기록'].includes(kind);
export function recordPolicy(section={}){
 const p=section.recordPolicy||{},ranking=p.ranking??(complex(section.kind)?'none':'auto');
 if(!['auto','none','metric'].includes(ranking)||complex(section.kind)&&ranking==='auto')throw Error('복합 기록은 순위 기준을 지정하거나 기록만 남기기를 선택해주세요.');
 const capUnit=p.capUnit??'횟수',metricLabel=String(p.metricLabel??'').trim(),metricOrder=p.metricOrder??'desc';
 if(!['횟수','칼로리','라운드 + 횟수'].includes(capUnit)||!['asc','desc'].includes(metricOrder)||metricLabel.length>40||ranking==='metric'&&!metricLabel)throw Error('구간의 순위 기준을 확인해주세요.');
 return {version:1,ranking,capUnit,metricLabel:ranking==='metric'?metricLabel:'',metricOrder};
}
export const policyKey=s=>{const p=recordPolicy(s);return JSON.stringify([s.kind,p.ranking,p.capUnit,p.metricLabel,p.metricOrder]);};
const integer=(v,label,max=10000000)=>{if(v===''||v==null||!/^\d+$/.test(String(v))||!Number.isSafeInteger(+v)||+v>max)throw Error(label+'은 0 이상의 정수로 입력해주세요.');return +v;};
const number=(v,label,max=1000000000)=>{if(!['string','number'].includes(typeof v)||v===''||v==null||!Number.isFinite(+v)||+v<0||+v>max)throw Error(label+'을 확인해주세요.');return +v;};
const clock=seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
export function normalizeRecordResult(section,input){
 if(!input||input.version!=null&&input.version!==1)throw Error('기록 양식을 확인해주세요.');
 const policy=recordPolicy(section),condition=input?.condition;
 if(!CONDITIONS.includes(condition))throw Error(`운동 조건(${RX_LABEL} / Scaled)을 선택해주세요.`);
 const result={version:1,condition,policyKey:policyKey(section)},out={result},kind=section.kind;
 if(['중량','1RM'].includes(kind)){result.lbs=number(input.lbs,'중량',6614);if(!result.lbs)throw Error('중량은 0보다 커야 해요.');out.lbs=result.lbs;}
 else if(kind==='시간'){
  if(!['completed','capped'].includes(input.status))throw Error('완료 또는 타임캡을 선택해주세요.');result.status=input.status;
  if(result.status==='completed'){result.seconds=integer(input.seconds,'시간',59999);if(!result.seconds)throw Error('완료 시간을 입력해주세요.');out.value=clock(result.seconds);}
  else{result.capUnit=policy.capUnit;result.progress=integer(input.progress,policy.capUnit==='라운드 + 횟수'?'라운드':'수행량');result.extra=policy.capUnit==='라운드 + 횟수'?integer(input.extra,'추가 횟수'):0;out.value=`타임캡 · ${result.progress}${policy.capUnit==='라운드 + 횟수'?'R + '+result.extra+'회':policy.capUnit==='칼로리'?' cal':'회'}`;}
 }else if(['횟수','칼로리'].includes(kind)){result.amount=integer(input.amount,kind);out.value=String(result.amount);}
 else if(kind==='라운드 + 횟수'){result.rounds=integer(input.rounds,'라운드');result.extra=integer(input.extra,'추가 횟수');out.value=`${result.rounds}R + ${result.extra}`;}
 else if(kind==='완료 여부'){if(typeof input.completed!=='boolean')throw Error('완료 여부를 선택해주세요.');result.completed=input.completed;out.value=result.completed?'완료':'미완료';}
 else if(complex(kind)){result.details=String(input.details??'').trim();if(!result.details||result.details.length>1000)throw Error('상세 결과를 1~1,000자로 입력해주세요.');out.value=result.details;}
 else throw Error('기록 종류를 확인해주세요.');
 if(policy.ranking==='metric')result.rankingValue=number(input.rankingValue,policy.metricLabel);
 return out;
}
// Existing text stays intact. Only unambiguous legacy values can fill typed fields.
export function legacyResult(record,section){
 if(record.result?.version===1)return {...record.result};
 const v=String(record.value??'').trim(),kind=section.kind,base={condition:'unspecified'};
 if(['중량','1RM'].includes(kind)&&Number.isFinite(record.lbs)&&record.lbs>0)return {...base,lbs:record.lbs};
 if(['횟수','칼로리'].includes(kind)&&/^\d+$/.test(v))return {...base,amount:+v};
 const time=v.match(/^(\d{1,3}):([0-5]\d)$/);if(kind==='시간'&&time&&+time[1]*60 + +time[2]>0)return {...base,status:'completed',seconds:+time[1]*60 + +time[2]};
 const rounds=v.match(/^(\d+)\s*(?:R|라운드)?\s*(?:\+\s*(\d+)\s*(?:회|reps?)?)?$/i);if(kind==='라운드 + 횟수'&&rounds)return {...base,rounds:+rounds[1],extra:+(rounds[2]||0)};
 if(kind==='완료 여부'&&['완료','미완료'].includes(v))return {...base,completed:v==='완료'};
 if(complex(kind))return {...base,details:v};return null;
}
export const recordCondition=r=>r.result?.condition||'unspecified';
export function structuredScore(record,section){
 const policy=recordPolicy(section);if(policy.ranking==='none')return null;
 if(!record.result){if(policy.ranking==='metric'||complex(section.kind))return null;return undefined;}
 if(record.result.policyKey!==policyKey(section))return null;
 let normalized;try{normalized=normalizeRecordResult(section,record.result).result;}catch{return null;}
 if(policy.ranking==='metric')return [(policy.metricOrder==='asc'?-1:1)*normalized.rankingValue];
 if(section.kind==='시간')return normalized.status==='completed'?[1,-normalized.seconds,0]:[0,normalized.progress,normalized.extra];
 if(section.kind==='라운드 + 횟수')return [normalized.rounds,normalized.extra];
 if(section.kind==='완료 여부')return [normalized.completed?1:0];
 return [normalized.lbs??normalized.amount];
}
export function canonicalRecordPayload(section,record,old){
 if(record.result){
  if(record.result.condition==='unspecified'&&(!old||recordCondition(old)!=='unspecified'))throw Error(`운동 조건(${RX_LABEL} / Scaled)을 선택해주세요.`);
  return normalizeRecordResult(section,record.result);
 }
 // Older clients can keep their existing text without silently converting it.
 if(old&&!old.result&&old.kind===section.kind&&(old.value??null)===(record.value??null)&&(old.lbs??null)===(record.lbs??null))return old.lbs!=null?{lbs:old.lbs}:{value:old.value};
 if(record.lbs!=null){if(!['중량','1RM'].includes(section.kind)||!Number.isFinite(record.lbs)||record.lbs<=0||record.lbs>6614)throw Error('중량을 확인해주세요.');return {lbs:record.lbs};}
 if(['중량','1RM'].includes(section.kind))throw Error('중량을 확인해주세요.');
 const value=String(record.value??'').trim();if(!value||value.length>120)throw Error('운동 결과를 확인해주세요.');
 if(section.kind==='시간'&&!/^\d{1,3}:[0-5]\d$/.test(value)||['횟수','칼로리'].includes(section.kind)&&!/^\d+$/.test(value))throw Error('운동 결과 형식을 확인해주세요.');return {value};
}
