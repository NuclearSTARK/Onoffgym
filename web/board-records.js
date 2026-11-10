import {legacyResult,normalizeRecordResult} from './record-schema.js';
export const DEFAULT_RECORD_TOOLS={photoEnabled:true,attendance:{enabled:false,latitude:null,longitude:null,radius:200}};
export function boardSections(workouts){return workouts.flatMap(w=>(w.sections||[]).filter(s=>s.record).map(s=>({key:w.program+':'+s.number,program:w.program,number:s.number,title:s.title,kind:s.kind,text:s.text||'',recordPolicy:s.recordPolicy,teamSize:Number((String(s.text)+' '+String(s.title)).match(/team\s+of\s+([23])/i)?.[1]||1)})));}
export function normalizeBoardRows(input,sections,members,{publish=false}={}){
 if(!Array.isArray(input)||input.length>150)throw Error('사진당 최대 150개 기록을 저장할 수 있어요.');
 const keys=new Set();return input.map((r,index)=>{
  const id=typeof r.id==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(r.id)?r.id:'row-'+index;if(keys.has(id))throw Error('중복된 기록이 있어요.');keys.add(id);
  const section=sections.find(s=>s.key===r.sectionKey),value=String(r.value??'').trim(),note=String(r.note??'').trim();
  if(value.length>200||note.length>500||!Array.isArray(r.participants)||!r.participants.length||r.participants.length>6)throw Error('이름·기록·메모를 확인해주세요.');
  const linked=new Set(),participants=r.participants.map(p=>{const name=String(p.name??'').trim(),memberId=p.memberId||null;if(!name||name.length>40||memberId&&!members.some(m=>m.id===memberId&&m.status==='approved')||memberId&&linked.has(memberId))throw Error('회원 연결 또는 이름을 확인해주세요.');if(memberId)linked.add(memberId);return {name,memberId};});
  const excluded=r.excluded===true,reviewed=r.reviewed===true;
  if(publish&&!excluded&&(!reviewed||!value||!section))throw Error('등록할 행의 수업 구간·결과를 확인하고 확인 완료를 선택해주세요.');
  if(publish&&!excluded&&section?.teamSize>1&&participants.length!==section.teamSize)throw Error('Team of '+section.teamSize+' 구간의 팀원을 확인해주세요.');
  const condition=['rx','scaled'].includes(r.condition)?r.condition:'unspecified';let result=null;
  if(section&&value){let cleaned=value.replace(/(\d+)\s*['′:]\s*(\d{1,2})(?:["″])?$/,(_,m,s)=>m+':'+s.padStart(2,'0'));const parsed=legacyResult({value:cleaned,lbs:/^\d+(?:\.\d+)?\s*lbs?$/i.test(value)?parseFloat(value):undefined},section);if(parsed)try{result=normalizeRecordResult(section,{...parsed,condition}).result;}catch{/* Preserve explicitly reviewed raw values; no fabricated scores. */}}
  return {id,sectionKey:section?.key||'',program:section?.program||(['B/T','WOD'].includes(r.program)?r.program:'WOD'),kind:section?.kind||'',teamSize:Math.max(participants.length,section?.teamSize||1),participants,value,note,condition,excluded,reviewed,result};
 });
}
// Only confirmed exact board aliases may link a name. Never guess from surnames.
export function linkBoardAliases(rows,aliases){return rows.map(r=>({...r,participants:r.participants.map(p=>({...p,memberId:aliases.find(a=>a.alias===p.name)?.member_id||null}))}));}
