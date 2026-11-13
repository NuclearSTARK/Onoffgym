export const GIFT_MESSAGES=['오늘도 체육관에 온 당신이 주인공! 🎄','어제보다 한 걸음, 충분히 잘하고 있어요! 🎁','산타도 응원하는 당신의 꾸준함! 🎅','오늘의 땀은 내일의 선물이에요! ✨','메리 크리스마스! 함께 운동해서 즐거워요. 💪'];
const safeStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function christmasDate(now=new Date()){const date=new Date(+now+9*3600000);return Number.isFinite(+date)?date.toISOString().slice(0,10):'';}
export function isChristmas(now=new Date()){return ['12-21','12-22','12-23','12-24','12-25'].includes(christmasDate(now).slice(5));}
export function christmasDismissed(storage,now=new Date()){try{return storage?.getItem('onoff-christmas-off')===christmasDate(now);}catch{return false;}}
export function christmasSettingMarkup(now=new Date(),storage=safeStorage()){return isChristmas(now)?`<div class="setting-row christmas-setting"><strong>크리스마스 효과</strong><button type="button" class="switch ${christmasDismissed(storage,now)?'':'on'}" role="switch" aria-checked="${!christmasDismissed(storage,now)}" aria-label="크리스마스 효과" data-christmas-toggle></button></div>`:'';}
export function installChristmasEffect({eligible=()=>true,now=()=>new Date(),storage=safeStorage(),onGift=()=>{}}={}){
 let host=null,offDate='';
 const disabled=()=>offDate===christmasDate(now())||christmasDismissed(storage,now());
 function refresh(){
  const show=eligible()&&isChristmas(now())&&!disabled();if(!show){host?.remove();host=null;return;}
  if(!host){host=document.createElement('aside');host.id='christmas-effect';host.setAttribute('aria-label','크리스마스 깜짝 이벤트');host.innerHTML=`<div class="christmas-decoration"><div class="christmas-snow" aria-hidden="true">${Array.from({length:24},(_,i)=>`<i style="--x:${(i*37)%100}%;--delay:${-(i%12)}s;--duration:${8+i%7}s;--size:${3+i%4}px"></i>`).join('')}</div><div class="christmas-sleigh"><img src="./assets/christmas-sleigh-v2.webp" width="2172" height="724" alt="" decoding="async"><button type="button" class="christmas-gift" aria-label="산타의 응원 선물 열기" title="산타의 응원 선물" data-christmas-gift>🎁</button></div></div><button type="button" class="christmas-dismiss" data-christmas-toggle aria-label="크리스마스 효과 끄기">❄️ 효과 끄기</button>`;document.body.append(host);}
  host.hidden=document.hidden;
 }
 function toggle(){if(disabled()){offDate='';try{storage?.removeItem('onoff-christmas-off');}catch{}}else{offDate=christmasDate(now());try{storage?.setItem('onoff-christmas-off',offDate);}catch{}}refresh();document.querySelectorAll('.christmas-setting button').forEach(b=>{const on=!disabled();b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));});}
 document.addEventListener('click',e=>{if(e.target.closest('[data-christmas-toggle]'))toggle();if(e.target.closest('[data-christmas-gift]')&&eligible()&&isChristmas(now())&&!disabled())onGift(GIFT_MESSAGES[Math.floor(Math.random()*GIFT_MESSAGES.length)]);});
 document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,60000);
 return {refresh,toggle,destroy(){clearInterval(timer);host?.remove();host=null;document.removeEventListener('visibilitychange',refresh);}};
}
