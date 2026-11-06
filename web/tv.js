import {paginateTvSections} from './tv-pagination.js';
import {shared,backendTvRequest} from './backend.js';
import {TV_COLORS,normalizeTvPreferences} from './tv-colors.js';
import {kstDate,addDays,tvWorkoutDate} from './core.js';
import {tvRegistrationMarkup} from './tv-registration.js';
let data=null,pages={BT:[],WOD:[]},pageIndex=0,offset=0,pollTimer,rotationTimer,refreshing=false;
let view='workout';
const demo=!!globalThis.ONOFF_DEMO||(!shared&&(location.hostname.includes('onoffgym-public-test')||new URLSearchParams(location.search).get('demo')==='1'));
const $=s=>document.querySelector(s),escapeTv=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo=`<span class="brand-mark tv-logo" role="img" aria-label="ONOFF CROSSFIT"><img src="./assets/onoff-logo-v4.svg?v=4" alt=""></span>`;
document.documentElement.dataset.theme='tv';
const colorStorageKey=shared?'onoff-tv-colors-'+globalThis.ONOFF_BACKEND.projectId:'onoff-tv-colors';
let localColors={};try{const saved=JSON.parse(localStorage.getItem(colorStorageKey)||'{}');for(const key of ['btColor','wodColor'])if(TV_COLORS.some(c=>c.id===saved[key]))localColors[key]=saved[key]}catch{}
function courseColors(){return normalizeTvPreferences({...data?.preferences,...localColors});}
function applyCourseColors(){const prefs=courseColors();for(const [field,css] of [['btColor','--tv-bt-color'],['wodColor','--tv-wod-color']])document.documentElement.style.setProperty(css,TV_COLORS.find(c=>c.id===prefs[field]).color);}

async function tvRequest(path,body){if(shared)return backendTvRequest(path,body);if(demo){const {demoRequest}=await import('./demo.js');return demoRequest(path,body)}const r=await fetch('.'+path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'TV 연결을 확인해주세요.'),{status:r.status});return value;}
function gate(message=''){
  clearTimeout(rotationTimer);$('#tv-controls').hidden=true;
  $('#tv-root').innerHTML=`<div class="tv-gate"><div class="tv-login-layout"><section class="tv-login-art">${logo}<p>ILGWANG, BUSAN · MEMBERS CLUB</p></section><section class="tv-login-card"><span class="tv-login-eyebrow">ONOFF · TV DISPLAY</span><h1>오늘의 운동 · TV 모드</h1><p>숫자 4자리 TV 암호로 접속해주세요.<br>회원 로그인 없이 오늘의 B/T와 WOD를 표시합니다.</p>${demo?'<p class="tv-message">공개 테스트 · 예시 운동만 표시됩니다.<br>처음 사용하는 브라우저의 테스트 암호는 <strong>0000</strong>입니다. 운영 메뉴에서 변경한 경우 해당 암호를 사용해주세요.</p>':''}<form id="tv-login"><label for="tv-password">TV 암호</label><input id="tv-password" name="password" type="password" minlength="4" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" required autocomplete="current-password"><button type="submit">TV 화면 열기</button></form><p class="tv-error" id="tv-error" role="alert">${escapeTv(message)}</p><a class="tv-link" href="./#login">앱으로 이동</a></section></div></div>`;
}
function displayText(text){if(data.preferences.unit==='kg')return text.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?) lbs/g,(_,a,b)=>(+a/2.2046226218).toFixed(1)+' / '+(+b/2.2046226218).toFixed(1)+' kg');return text;}
function workoutHtml(sec){return `<section class="tv-section" data-tv-section="${sec.number}">${sec.showNumber?`<h2><span class="tv-section-number">S${sec.number}</span></h2>`:''}<div class="tv-exercise">${escapeTv(sec.text.trim())}</div></section>`;}
function flowColumnCount(){return document.documentElement.dataset.orientation==='landscape'&&!!$('.tv-columns.single')?3:1;}
function flowMarkup(columns){return columns.map(fragments=>`<div class="tv-flow-column">${fragments.map(workoutHtml).join('')}</div>`).join('');}
function render(){
  clearTimeout(rotationTimer);
  document.documentElement.dataset.orientation=courseColors().orientation;
  document.documentElement.dataset.tvView=view;
  const day=new Date(data.date+'T12:00:00+09:00').getUTCDay(),programs=day===3?['WOD']:['B/T','WOD'];
  $('#tv-root').innerHTML=`<div class="tv-viewport"><div class="tv-shell"><header class="tv-header"><span class="tv-date">${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(data.date+'T12:00:00+09:00'))}</span>${logo}${view==='registration'?'<div class="tv-header-actions"><time class="tv-clock" id="tv-clock"></time><button type="button" class="tv-registration-return" data-tv-control="registration-close" aria-label="운동 화면으로 돌아가기">← 운동 화면</button></div>':'<time class="tv-clock" id="tv-clock"></time>'}</header>${view==='registration'?tvRegistrationMarkup():`<div class="tv-columns ${programs.length===1?'single':''}">${programs.map(p=>`<article class="tv-column" data-tv-program="${p}"><header class="tv-program"><strong>${p}</strong><p>${p==='B/T'?'Body Training':'Work of the Day'}</p></header><div class="tv-sections" id="tv-${p==='B/T'?'BT':'WOD'}"></div><div class="tv-pagination" id="page-${p==='B/T'?'BT':'WOD'}"></div></article>`).join('')}</div>`}</div></div>${view==='workout'?'<button class="tv-open-controls" data-tv-control="open" aria-label="TV 설정 열기">설정</button>':''}`;
  fitCanvas();buildPages();tickTv();renderControls();
}
function buildPages(){
  if(view!=='workout'){clearTimeout(rotationTimer);return;}
  const count=flowColumnCount();
  for(const key of ['BT','WOD']){
    const box=$('#tv-'+key);pages[key]=[];if(!box)continue;
    box.style.setProperty('--tv-flow-columns',count);
    box.innerHTML=Array.from({length:count},()=>'<div class="tv-flow-column"></div>').join('');
    const columns=[...box.children],program=key==='BT'?'B/T':'WOD',w=data.workouts.find(w=>w.program===program);
    pages[key]=paginateTvSections((w?.sections||[]).map(s=>({...s,text:displayText(s.text||'')})),{columns:count,fits:(fragments,index)=>{const column=columns[index];column.innerHTML=fragments.map(workoutHtml).join('');return column.scrollHeight<=column.clientHeight+1;}});
  }
  showPage();clearTimeout(rotationTimer);rotate();
}
function tvEmptyState(){const rest=['holiday','rest'].includes(data.dayState),open=data.dayState==='open-gym';return `<div class="tv-rest"><h1>${rest?'휴강':open?'OPEN GYM':'운동 준비 중'}</h1><p>${rest?escapeTv(data.holidayName||'정규 수업이 없는 날입니다.'):open?'자유롭게 개인 운동을 진행해주세요.':'이 수업의 운동이 아직 등록되지 않았습니다.'}</p></div>`;}
function showPage(){for(const key of ['BT','WOD']){const box=$('#tv-'+key),label=$('#page-'+key);if(!box)continue;const list=pages[key]||[],index=list.length?((pageIndex%list.length)+list.length)%list.length:0;box.innerHTML=list.length?flowMarkup(list[index]):tvEmptyState();label.textContent=list.length>1?`${index+1} / ${list.length} · 자동 전환`:'';}}
function rotate(){rotationTimer=setTimeout(()=>{pageIndex++;showPage();rotate()},(data.preferences.pageSeconds||20)*1000);}
function switchView(next){
  if(!data||!['workout','registration'].includes(next))return;
  view=next;
  $('#tv-controls').hidden=true;
  render();
  $(view==='registration'?'[data-tv-control=registration-close]':'[data-tv-control=open]')?.focus({preventScroll:true});
}
function tickTv(){const now=new Date(Date.now()+offset);if($('#tv-clock'))$('#tv-clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);if(data){if(tvWorkoutDate(now,data.releaseTime)!==data.date&&!refreshing)refresh();}}
async function refresh(){if(refreshing)return;refreshing=true;try{const next=await tvRequest('/api/tv/bootstrap');const changed=!data||JSON.stringify(next.workouts)!==JSON.stringify(data.workouts)||next.date!==data.date||JSON.stringify(next.preferences)!==JSON.stringify(data.preferences)||next.dayState!==data.dayState||next.releaseTime!==data.releaseTime||next.holidayName!==data.holidayName;data=next;offset=Date.parse(next.serverNow)-Date.now();applyCourseColors();if(changed)render();await reportDisplay();}catch(e){if(e.status===401||!data){data=null;if(!$('#tv-login'))gate(e.status===401?'':e.message)}}finally{refreshing=false;clearTimeout(pollTimer);pollTimer=setTimeout(refresh,30000)}}
function renderControls(){const prefs=courseColors();$('#tv-controls').innerHTML=`<h2>TV 화면 설정</h2><button type="button" class="tv-registration-open" data-tv-control="registration">앱 등록</button>${[['btColor','B/T'],['wodColor','WOD']].map(([key,title])=>`<fieldset class="tv-color-field"><legend>${title} 색상</legend><div class="tv-color-grid">${TV_COLORS.map(c=>`<button type="button" data-tv-color="${c.id}" data-color-field="${key}" class="tv-color-choice" aria-label="${title} ${c.name}" aria-pressed="${prefs[key]===c.id}"><span style="background:${c.color}"></span>${c.name}</button>`).join('')}</div></fieldset>`).join('')}<div class="tv-control-row"><button data-tv-control="fullscreen">전체 화면</button><button data-tv-control="next" ${view!=='workout'?'disabled':''}>다음 페이지</button><button data-tv-control="defaults">운영 설정 색상 사용</button><button data-tv-control="close">설정 닫기</button><button data-tv-control="logout">TV 연결 해제</button></div><p style="color:var(--muted);font-size:12px;line-height:1.7">선택한 수업 색상은 이 TV에 저장됩니다.<br>앱 등록 버튼에서 QR·홈 화면 추가·알림 설정 안내를 열 수 있어요.<br>리모컨 좌우: 운동 페이지 이동 · Esc: 설정 열기/닫기</p>`;}

document.addEventListener('submit',async e=>{if(e.target.id!=='tv-login')return;e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;try{await tvRequest('/api/tv/login',{password:new FormData(e.target).get('password')});await refresh()}catch(err){$('#tv-error').textContent=err.message}finally{button.disabled=false}});
document.addEventListener('click',async e=>{const button=e.target.closest('button');if(!button)return;const d=button.dataset;if(d.tvColor&&['btColor','wodColor'].includes(d.colorField)&&TV_COLORS.some(c=>c.id===d.tvColor)){localColors[d.colorField]=d.tvColor;try{localStorage.setItem(colorStorageKey,JSON.stringify(localColors))}catch{}applyCourseColors();renderControls();reportDisplay();document.querySelector(`[data-tv-color="${d.tvColor}"][data-color-field="${d.colorField}"]`)?.focus();return}switch(d.tvControl){case'registration':switchView('registration');break;case'registration-close':switchView('workout');break;case'open':$('#tv-controls').hidden=false;break;case'close':$('#tv-controls').hidden=true;break;case'defaults':localColors={};try{localStorage.removeItem(colorStorageKey)}catch{}applyCourseColors();renderControls();reportDisplay();break;case'next':if(view==='workout'){pageIndex++;showPage();}break;case'fullscreen':try{await document.documentElement.requestFullscreen?.()}catch{}break;case'logout':await tvRequest('/api/tv/logout',{});data=null;gate();break;}});

document.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.key==='Escape'){if(view==='registration')switchView('workout');else $('#tv-controls').hidden=!$('#tv-controls').hidden;}if(data&&view==='workout'&&$('#tv-controls').hidden&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();pageIndex+=e.key==='ArrowRight'?1:-1;showPage();}});
function fitCanvas(){const canvas=$('.tv-shell');if(!canvas)return;const portrait=courseColors().orientation==='portrait',width=portrait?1080:1920,height=portrait?1920:1080,scale=Math.min(innerWidth/width,innerHeight/height);canvas.style.transform=`translate(-50%,-50%) scale(${scale})`;}
let resizeFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(data){fitCanvas();buildPages();}})});document.fonts?.ready.then(()=>{if(data)buildPages();});setInterval(tickTv,1000);refresh();

async function reportDisplay(){if(!data)return;try{await tvRequest('/api/tv/heartbeat',{displayDate:data.date,preferences:{...data.preferences,...courseColors()}})}catch{/* Keep the workout visible; the next refresh retries and stale status is shown to admins. */}}
