import {COACH_PERMISSIONS} from './permissions.js';
export const COACH_GROUPS=[
 ['classes','수업 관리','수업·ACC 조회, 등록과 수정',['workouts.read','workouts.create','workouts.update','acc.read','acc.create','acc.update']],
 ['records','회원 기록·사진','회원 기록 입력·수정과 사진 관리',['records.create','records.update','photos']],
 ['content','운동 콘텐츠','운동 영상과 1RM 종목 관리',['videos','rm']],
 ['announcements','공지·배너','공지와 홈 배너 관리',['notices','banner']]
];
const advanced=['workouts.delete','records.delete','acc.delete','push','release','tv'];
const groupState=(keys,allowed)=>{const n=keys.filter(k=>allowed.has(k)).length;return n===0?'false':n===keys.length?'true':'mixed';};
export function coachPermissionsMarkup(member,{escape=String}={}){
 const allowed=new Set(member.coach_permissions||[]),e=escape,option=key=>`<label class="coach-permission-option"><span>${e(COACH_PERMISSIONS.find(x=>x[0]===key)[1])}</span><input type="checkbox" role="switch" name="coach_permissions" value="${key}" aria-label="${e(COACH_PERMISSIONS.find(x=>x[0]===key)[1])}" ${allowed.has(key)?'checked':''}></label>`,extra=advanced.filter(k=>allowed.has(k)).length;
 return `<section class="coach-permissions" ${member.role==='coach'?'':'hidden'}><h4>코치 권한</h4><p class="field-hint">필요한 관리 기능만 켜주세요. 회원·회원권·포인트 관리는 운영자 전용이에요.</p><div class="coach-main-groups">${COACH_GROUPS.map(([id,title,description,keys])=>{const state=groupState(keys,allowed);return `<div class="coach-main-group"><div><strong>${title}</strong><small>${description}</small><span class="coach-group-state" data-coach-state="${id}">${state==='mixed'?'일부 허용':state==='true'?'허용':'꺼짐'}</span></div><button type="button" class="switch ${state==='true'?'on':state==='mixed'?'partial':''}" role="checkbox" aria-checked="${state}" aria-label="${title}" data-coach-group="${id}"></button></div>`;}).join('')}</div><details class="coach-advanced"><summary>세부 권한 조정 <span data-coach-extra>${extra?'삭제·운영 설정 '+extra+'개 허용':'삭제·푸시·운영 설정 포함'}</span></summary><p class="field-hint">묶음에서 일부 기능만 허용하거나 삭제·푸시·운영 설정을 개별로 조정하세요.</p>${COACH_GROUPS.map(([,title,,keys])=>`<fieldset class="coach-permission-group"><legend>${title}</legend>${keys.map(option).join('')}</fieldset>`).join('')}<fieldset class="coach-permission-group"><legend>삭제·운영 설정</legend>${advanced.map(option).join('')}</fieldset></details></section>`;
}
export function syncCoachGroups(root){
 const allowed=new Set([...root.querySelectorAll('[name="coach_permissions"]:checked')].map(el=>el.value));
 for(const [id,,,keys]of COACH_GROUPS){const state=groupState(keys,allowed),button=root.querySelector(`[data-coach-group="${id}"]`);button.setAttribute('aria-checked',state);button.classList.toggle('on',state==='true');button.classList.toggle('partial',state==='mixed');root.querySelector(`[data-coach-state="${id}"]`).textContent=state==='mixed'?'일부 허용':state==='true'?'허용':'꺼짐';}
 const n=advanced.filter(k=>allowed.has(k)).length;root.querySelector('[data-coach-extra]').textContent=n?'삭제·운영 설정 '+n+'개 허용':'삭제·푸시·운영 설정 포함';
}
if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{const button=e.target.closest('[data-coach-group]');if(!button)return;const root=button.closest('.coach-permissions'),group=COACH_GROUPS.find(g=>g[0]===button.dataset.coachGroup),on=button.getAttribute('aria-checked')!=='true';for(const input of root.querySelectorAll('[name="coach_permissions"]'))if(group[3].includes(input.value))input.checked=on;syncCoachGroups(root);root.dispatchEvent(new Event('change',{bubbles:true}));});
 document.addEventListener('change',e=>{if(e.target.matches('[name="coach_permissions"]'))syncCoachGroups(e.target.closest('.coach-permissions'));});
}
