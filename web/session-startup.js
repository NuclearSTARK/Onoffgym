export function createSessionStartup(){
 const overlay=document.querySelector('#session-startup');if(!overlay)return {finish(){}};
 const started=performance.now();let active=!overlay.hidden,version=0;
 function hide(){overlay.hidden=true;document.documentElement.classList.remove('app-booting');}
 function finish(){if(!active)return;active=false;const current=version,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,remaining=reduced?0:Math.max(0,1200-(performance.now()-started));setTimeout(()=>{if(current!==version)return;overlay.classList.add('startup-leaving');setTimeout(()=>{if(current===version)hide();},reduced?0:300);},remaining);}
 // A return from another app or the back/forward cache never replays startup.
 window.addEventListener('pagehide',()=>{version++;active=false;hide();});
 return {finish};
}
