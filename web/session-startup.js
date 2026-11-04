export function createSessionStartup(){
 const overlay=document.querySelector('#session-startup');if(!overlay)return {finish(){}};
 // Keep every startup entry point, including a restored document, on the same
 // current brand/copy. History restoration does not replay a startup overlay.
 function normalize(){const copy=overlay.querySelector('[role="status"]');if(copy)copy.textContent='당신의 열정을 켜는 중…';const img=overlay.querySelector('.brand-mark img');if(img)img.setAttribute('src','assets/onoff-logo-v4.svg?v=4');}
 normalize();
 const started=performance.now();let active=!overlay.hidden,version=0;
 function hide(){overlay.hidden=true;document.documentElement.classList.remove('app-booting');}
 function finish(){if(!active)return;active=false;const current=version,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,remaining=reduced?0:Math.max(0,1200-(performance.now()-started));setTimeout(()=>{if(current!==version)return;overlay.classList.add('startup-leaving');setTimeout(()=>{if(current===version)hide();},reduced?0:300);},remaining);}
 // A return from another app or the back/forward cache never replays startup.
 window.addEventListener('pagehide',()=>{version++;active=false;hide();});
 window.addEventListener('pageshow',event=>{normalize();if(event.persisted){version++;active=false;hide();}});
 return {finish};
}
