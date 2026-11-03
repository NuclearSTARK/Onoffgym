import {refreshIcon} from './standard-controls.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const metric=(title,bytes,limit)=>{
 const percent=bytes===undefined?null:bytes/limit*100;
 return `<div class="storage-metric ${percent>=80?'storage-warning':''}"><span>${title}</span><strong>${percent===null?'—':`${(bytes/1e6).toFixed(1)} / ${limit/1e6} MB · ${percent.toFixed(1)}%`}</strong><progress value="${percent===null?0:Math.min(100,percent)}" max="100" aria-label="${title} 사용률" ${percent===null?'aria-valuetext="조회 전"':''}></progress></div>`;
};
export function createStorageUsage({request,shared}){
 let owner='',data=null,pending=false,error='',generation=0,root=null;
 const status=()=>!shared?'실제 사용량은 회원용 앱에서 확인해주세요.':error?'조회 실패 · '+error:pending?'저장공간 확인 중…':data?'마지막 조회 결과':'새로고침을 눌러 사용량을 확인하세요.';
 const markup=()=>`<div class="storage-usage-head"><strong>저장공간</strong><button type="button" class="icon-control storage-refresh" aria-label="저장공간 새로고침" title="저장공간 새로고침" ${pending||!shared?'disabled':''}>${refreshIcon}</button></div><div class="storage-usage-metrics" aria-busy="${pending}">${metric('DB',data?.databaseBytes,data?.databaseLimit)}${metric('사진·파일',data?.storageBytes,data?.storageLimit)}</div><p class="storage-usage-status" role="status">${esc(status())}</p>`;
 function paint(){if(!root?.isConnected)return;const button=root.querySelector('.storage-refresh'),metrics=root.querySelector('.storage-usage-metrics');button.disabled=pending||!shared;button.onclick=refresh;metrics.setAttribute('aria-busy',String(pending));metrics.innerHTML=metric('DB',data?.databaseBytes,data?.databaseLimit)+metric('사진·파일',data?.storageBytes,data?.storageLimit);root.querySelector('.storage-usage-status').textContent=status();}
 async function refresh(){
  if(!owner||!shared||pending)return;
  const current=++generation;pending=true;error='';paint();
  try{
   const result=await request('/api/storage-usage');
   if(current!==generation)return;
   if(!['databaseBytes','storageBytes'].every(k=>Number.isFinite(result[k])&&result[k]>=0)||!['databaseLimit','storageLimit'].every(k=>Number.isFinite(result[k])&&result[k]>0))throw Error('사용량을 확인하지 못했어요. 다시 시도해주세요.');
   data=result;
  }catch(e){if(current===generation)error=e.message||'다시 시도해주세요.';}
  finally{if(current===generation){pending=false;paint();}}
 }
 return {
  owner(viewer){const next=viewer?.role==='admin'&&viewer.status==='approved'?viewer.id:'';if(next===owner)return;owner=next;generation++;data=null;pending=false;error='';root=null;},
  markup,
  mount(element){root=element;paint();}
 };
}
