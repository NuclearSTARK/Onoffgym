const safeStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function christmasDate(now=new Date()){const date=new Date(+now+9*3600000);return Number.isFinite(+date)?date.toISOString().slice(0,10):'';}
export function isChristmas(now=new Date()){return ['12-24','12-25'].includes(christmasDate(now).slice(5));}
export function christmasDismissed(storage,now=new Date()){try{return storage?.getItem('onoff-christmas-off')===christmasDate(now);}catch{return false;}}
export function christmasSettingMarkup(now=new Date(),storage=safeStorage()){return isChristmas(now)?`<div class="setting-row christmas-setting"><strong>크리스마스 효과</strong><button type="button" class="switch ${christmasDismissed(storage,now)?'':'on'}" role="switch" aria-checked="${!christmasDismissed(storage,now)}" aria-label="크리스마스 효과" data-christmas-toggle></button></div>`:'';}
export function installChristmasEffect({eligible=()=>true,now=()=>new Date(),storage=safeStorage()}={}){
 let host=null,offDate='';
 const disabled=()=>offDate===christmasDate(now())||christmasDismissed(storage,now());
 function refresh(){
  const show=eligible()&&isChristmas(now())&&!disabled();if(!show){host?.remove();host=null;return;}
  if(!host){host=document.createElement('aside');host.id='christmas-effect';host.setAttribute('aria-label','크리스마스 깜짝 이벤트');host.innerHTML=`<div class="christmas-decoration" aria-hidden="true"><div class="christmas-snow">${Array.from({length:24},(_,i)=>`<i style="--x:${(i*37)%100}%;--delay:${-(i%12)}s;--duration:${8+i%7}s;--size:${3+i%4}px"></i>`).join('')}</div><div class="christmas-sleigh"><img src="./assets/christmas-sleigh-v1.png" width="2172" height="724" alt="" decoding="async"></div></div><button type="button" class="christmas-dismiss" data-christmas-toggle aria-label="크리스마스 효과 끄기">❄️ 효과 끄기</button>`;document.body.append(host);}
  host.hidden=document.hidden;
 }
 function toggle(){if(disabled()){offDate='';try{storage?.removeItem('onoff-christmas-off');}catch{}}else{offDate=christmasDate(now());try{storage?.setItem('onoff-christmas-off',offDate);}catch{}}refresh();document.querySelectorAll('.christmas-setting button').forEach(b=>{const on=!disabled();b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));});}
 document.addEventListener('click',e=>{if(e.target.closest('[data-christmas-toggle]'))toggle();});
 document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,60000);
 return {refresh,toggle,destroy(){clearInterval(timer);host?.remove();host=null;document.removeEventListener('visibilitychange',refresh);}};
}
