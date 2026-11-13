import {christmasDate} from './christmas-effect.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const newYearWelcomeDate=now=>/^2027-01-0[1-7]$/.test(christmasDate(now));
export function improvedBests(before,after){
 if(!before||!after||before.owner!==after.owner)return [];
 const improved=[];
 for(const r of after.rm||[]){const b=before.rm?.find(x=>x.id===r.id);if(b&&Number.isFinite(+r.lbs)&&+r.lbs>+b.lbs)improved.push({label:r.label,value:r.lbs,type:'rm'});}
 for(const r of after.named||[]){const b=before.named?.find(x=>x.id===r.id);if(!b||b.type!==r.type)continue;const better=r.type==='time'?Number.isFinite(r.seconds)&&r.seconds>0&&r.seconds<b.seconds:r.type==='rounds'&&(r.rounds>b.rounds||r.rounds===b.rounds&&r.reps>b.reps);if(better)improved.push({label:r.label,value:r,type:'named'});}
 return improved;
}
export function namedScore(r){return r.type==='time'?`${Math.floor(r.seconds/60)}:${String(r.seconds%60).padStart(2,'0')}`:`${r.rounds}R${r.reps?' + '+r.reps:''}`;}
export function stampMarkup(stats,now){const d=stats?.firstWorkout2027;return /^2027-\d{2}-\d{2}$/.test(d||'')&&d<=christmasDate(now)?`<div class="first-workout-stamp"><span>✦</span><strong>2027 첫 운동 완료</strong><time datetime="${d}">${d.replaceAll('-','. ')}</time></div>`:'';}
export function createMemberEvents({raw,context,modal,toast}={}){
 let owner='',generation=0,stats=null,inflight=null,lastRead=0,queue=[],display=null,displayTimer,writeTail=Promise.resolve(),seen=new Set(),celebrations=true;
 function sync(){const c=context(),id=c.approved&&!c.preview?c.id||'':'';if(id!==owner){owner=id;generation++;stats=null;inflight=null;lastRead=0;queue=[];display?.remove();display=null;clearTimeout(displayTimer);}return c;}
 function patch(){const c=sync();document.querySelectorAll('[data-first-workout-stamp]').forEach(el=>{const html=owner?stampMarkup(stats,c.now):'';el.innerHTML=html;el.hidden=!html;});}
 async function read(force=false){sync();if(!owner)return null;if(inflight)return inflight;if(stats&&!force&&Date.now()-lastRead<60000)return stats;const id=owner,g=generation;
  const pending=raw('/api/member-milestones').then(value=>{if(owner!==id||generation!==g||value?.owner!==id)return null;stats=value;lastRead=Date.now();patch();return stats;}).finally(()=>{if(inflight===pending)inflight=null;});inflight=pending;return pending;
 }
 function welcome(){const c=sync();if(!owner||!c.eligible||!newYearWelcomeDate(c.now)||c.preferences?.newYear2027Seen===true||seen.has(owner))return;let localSeen=false;try{localSeen=localStorage.getItem('onoff-newyear-2027-'+owner)==='1';}catch{}if(localSeen)return;
  if(!queue.some(e=>e.kind==='welcome'))queue.push({kind:'welcome',owner});
 }
 function refresh(data){sync();celebrations=data?.celebrations!==false;patch();if(owner){read().catch(()=>{});welcome();}}
 function clearDisplay(){display?.remove();display=null;}
 function tick(){const c=sync();if(display||!owner||!c.eligible||document.hidden||document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;welcome();const event=queue.shift();if(!event||event.owner!==owner)return;if(event.kind==='pr'&&!celebrations)return;
  if(event.kind==='welcome'){
   if(c.preferences?.newYear2027Seen===true||seen.has(owner)||!newYearWelcomeDate(c.now))return;
   seen.add(owner);try{localStorage.setItem('onoff-newyear-2027-'+owner,'1');}catch{}raw('/api/preferences',{newYear2027Seen:true}).catch(()=>{});
  }
  display=document.createElement('aside');display.className='member-celebration '+(event.kind==='welcome'?'newyear-welcome':'pr-celebration');display.setAttribute('role','status');
  display.innerHTML=event.kind==='welcome'?'<strong class="newyear-number">2027</strong><p>새해의 나를 ON!</p>':`<div class="gold-burst" aria-hidden="true">${Array.from({length:16},(_,i)=>`<i style="--angle:${i*22.5}deg;--distance:${70+i%3*24}px"></i>`).join('')}</div><span>✦ NEW PERSONAL BEST ✦</span><strong>${esc(c.name)}님, 최고 기록!</strong><p>${event.items.slice(0,2).map(x=>esc(x.label)).join(' · ')}</p>`;
  document.body.append(display);displayTimer=setTimeout(clearDisplay,event.kind==='welcome'?3000:2800);
 }
 async function mutation(path,body,options){sync();const id=owner,g=generation;const candidate=id&&body&&['/api/rms','/api/records','/api/named-wods/record'].includes(path)&&!(path==='/api/records'&&body.records?.every(r=>r.memberId&&r.memberId!==id));
  const before=candidate?await read(true).catch(()=>null):null;
  const result=await raw(path,body,options); // Never celebrate a rejected write.
  if(owner===id&&generation===g&&(candidate||path==='/api/attendance')){
   const after=await read(true).catch(()=>null);if(candidate&&before&&after&&owner===id&&generation===g){const items=improvedBests(before,after);if(items.length)queue.push({kind:'pr',owner:id,items});}
  }return result;
 }
 function request(path,body,options){if(body&&['/api/rms','/api/records','/api/named-wods/record','/api/attendance'].includes(path)){const run=writeTail.then(()=>mutation(path,body,options));writeTail=run.catch(()=>{});return run;}return raw(path,body,options);}
 function settingsMarkup(){const c=sync();celebrations=c.preferences?.celebrations!==false;const recap=christmasDate(c.now)>='2027-01-01';return `<div class="setting-row"><strong>최고 기록 축하</strong><button type="button" class="switch ${celebrations?'on':''}" role="switch" aria-checked="${celebrations}" aria-label="최고 기록 축하" data-celebrations-toggle></button></div>${recap?'<div class="setting-row"><strong>2026 운동 결산</strong><button type="button" class="link" data-member-recap>결산 보기 →</button></div>':''}`;}
 async function openRecap(){const c=sync(),id=owner,g=generation;if(!id||christmasDate(c.now)<'2027-01-01')return;try{const value=await read(true);if(owner!==id||generation!==g||!value)return;const r=value.recap;
   modal('2026 운동 결산',`<section class="year-recap"><div class="recap-eyebrow">ONOFF · YEAR IN REVIEW</div><h3>${esc(c.name)}님의 2026</h3><div class="recap-metrics"><div><strong>${r.attendance}</strong><span>출석 일수</span></div><div><strong>${r.rmCount}</strong><span>1RM 기록</span></div><div><strong>${r.namedCount}</strong><span>NAMED WOD 기록</span></div></div><h4>올해 남긴 최고 기록</h4>${[...r.rm.slice(0,3).map(x=>({label:x.label,score:weight(x.lbs,c.unit)})),...r.named.slice(0,3).map(x=>({label:x.label,score:namedScore(x)}))].map(x=>`<div class="recap-record"><span>${esc(x.label)}</span><strong>${esc(x.score)}</strong></div>`).join('')||'<p>기록을 남기면 다음 결산에서 만나요.</p>'}<p class="field-hint">앱에 저장된 2026년 기록 기준입니다.</p><button type="button" class="btn primary full" data-recap-save>결산 이미지 저장</button></section>`);
   const button=document.querySelector('[data-recap-save]');button?.addEventListener('click',async()=>{if(owner!==id||generation!==g)return;button.disabled=true;try{const canvas=recapCanvas(value,c);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('이미지를 만들지 못했어요.');const file=new File([blob],'ONOFF-2026.png',{type:'image/png'});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'나의 2026 운동 결산'});else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}}catch(e){if(e.name!=='AbortError')toast(e.message);}finally{button.disabled=false;}});
  }catch(e){toast(e.message);}
 }
 document.addEventListener('click',async e=>{if(e.target.closest('[data-member-recap]'))openRecap();const button=e.target.closest('[data-celebrations-toggle]');if(!button)return;const c=sync(),id=owner;if(!id)return;button.disabled=true;try{const next=!celebrations;await raw('/api/preferences',{celebrations:next});sync();if(owner!==id)return;celebrations=next;if(c.preferences)c.preferences.celebrations=next;button.classList.toggle('on',next);button.setAttribute('aria-checked',String(next));}catch(e){toast(e.message);}finally{button.disabled=false;}});
 const timer=setInterval(tick,700);
 return {request,refresh,patch,settingsMarkup,stamp:()=>stampMarkup(stats,context().now),read,destroy(){clearInterval(timer);clearTimeout(displayTimer);clearDisplay();}};
}
function weight(lbs,unit){const n=unit==='kg'?lbs/2.2046226218:lbs;return `${Math.round(n*10)/10} ${unit==='kg'?'kg':'lbs'}`;}
export function recapCanvas(stats,{name,unit='lbs'}={}){const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const x=canvas.getContext('2d'),r=stats.recap;
 const gradient=x.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,'#172943');gradient.addColorStop(1,'#09111e');x.fillStyle=gradient;x.fillRect(0,0,1080,1350);
 const text=(value,y,size,color='#f2f5fa',bold=false,max=920)=>{x.fillStyle=color;x.font=`${bold?'700':'400'} ${size}px sans-serif`;x.fillText(String(value),80,y,max);};
 text('ONOFF CROSSFIT',110,32,'#dcbc76',true);text('2026',270,132,'#f5d394',true);text(`${name}님의 운동 결산`,345,42,'#ffffff',true);
 const metrics=[[r.attendance,'출석 일수'],[r.rmCount,'1RM 기록'],[r.namedCount,'NAMED WOD 기록']];metrics.forEach(([n,label],i)=>{x.fillStyle='#f5d394';x.font='700 70px sans-serif';x.fillText(String(n),80+i*320,505,290);x.font='28px sans-serif';x.fillStyle='#b8c6d9';x.fillText(label,80+i*320,553,290);});
 text('올해 남긴 최고 기록',660,30,'#dcbc76',true);const rows=[...r.rm.slice(0,3).map(v=>[v.label,weight(v.lbs,unit)]),...r.named.slice(0,3).map(v=>[v.label,namedScore(v)])];rows.forEach(([label,value],i)=>{text(label,735+i*64,30,'#e6ebf3',false,650);x.textAlign='right';x.fillStyle='#f5d394';x.font='700 30px sans-serif';x.fillText(value,1000,735+i*64,220);x.textAlign='left';});
 if(!rows.length)text('운동을 이어온 당신을 응원합니다.',760,32);text('앱에 저장된 2026년 기록 기준',1220,25,'#aab9ce');text('새해의 나를 ON!',1280,34,'#f5d394',true);return canvas;
}
