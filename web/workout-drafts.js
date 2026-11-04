const PREFIX='onoff-workout-draft-v1:';
export function createWorkoutDrafts(storage,{now=()=>Date.now()}={}){
 const key=(owner,date,program)=>PREFIX+owner+':'+date+':'+program;
 return {
  read(owner,date,program){try{const d=JSON.parse(storage.getItem(key(owner,date,program))||'null');return d?.owner===owner&&d.date===date&&d.program===program&&Array.isArray(d.sections)&&d.sections.length>=1&&d.sections.length<=99&&now()-d.updatedAt<7*86400000?d:null;}catch{return null;}},
  write(owner,date,program,value){const d={...value,owner,date,program,updatedAt:now()};storage.setItem(key(owner,date,program),JSON.stringify(d));return d;},
  remove(owner,date,program){try{storage.removeItem(key(owner,date,program));return true;}catch{return false;}}
 };
}
export function readWorkoutEditor(form){const b=Object.fromEntries(new FormData(form));return {sections:Array.from({length:Number(form.dataset.count)},(_,i)=>({title:String(b['title'+i]||''),text:String(b['text'+i]||''),record:b['record'+i]==='on',kind:String(b['kind'+i]||'중량'),recordPolicy:{version:1,ranking:b['ranking'+i]||(['세트별 횟수·칼로리','자유 기록'].includes(b['kind'+i])?'none':'auto'),capUnit:b['capUnit'+i]||'횟수',metricLabel:b['metricLabel'+i]||'',metricOrder:b['metricOrder'+i]||'desc'},movements:String(b['movements'+i]||'').split(/[;,\n]/).map(s=>s.trim()).filter(Boolean)})),overview:String(b.overview||''),sessions:String(b.sessions||'')};}
