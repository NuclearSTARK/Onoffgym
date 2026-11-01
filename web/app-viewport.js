// Keep navigation in the shell flow, outside the content scroller. WebKit's
// position:fixed footer can retain an old layout viewport after PWA resume.
export function viewportHeight({visualHeight,innerHeight,scale=1,editing=false}){
 let value=innerHeight;
 if(scale===1&&Number.isFinite(visualHeight)&&visualHeight>0)value=editing?visualHeight:Math.max(Number.isFinite(innerHeight)?innerHeight:0,visualHeight);
 return Number.isFinite(value)&&value>0?Math.round(value*100)/100:null;
}
export function installAppViewport(){
 const media=matchMedia('(max-width:760px)'),app=document.querySelector('.app');let timers=[];
 function sync(){
  document.documentElement.classList.toggle('app-shell',media.matches&&!document.body.classList.contains('login-mode'));
  const v=window.visualViewport,editing=!!document.activeElement?.matches('textarea,select,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),[contenteditable=true]');
  const h=viewportHeight({visualHeight:v?.height,innerHeight:window.innerHeight,scale:v?.scale??1,editing});if(h)document.documentElement.style.setProperty('--app-viewport-height',h+'px');
 }
 const refresh=()=>{sync();requestAnimationFrame(sync);};
 const resume=()=>{refresh();timers.forEach(clearTimeout);timers=[80,250,700].map(ms=>setTimeout(sync,ms));};
 window.addEventListener('resize',refresh,{passive:true});window.addEventListener('pageshow',resume);window.addEventListener('orientationchange',resume);window.visualViewport?.addEventListener('resize',refresh,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});document.addEventListener('focusin',refresh);document.addEventListener('focusout',resume);media.addEventListener('change',resume);sync();
 const root=()=>media.matches&&!document.body.classList.contains('login-mode')?app:window;
 return {top:()=>root()===window?window.scrollY:app.scrollTop,to:(...args)=>root().scrollTo(...args),refresh:resume};
}
