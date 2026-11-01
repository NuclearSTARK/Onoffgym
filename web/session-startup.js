export function createSessionStartup({isAuthenticated=()=>false}={}){
 const overlay=document.querySelector('#session-startup');if(!overlay)return {finish(){}};
 let started=performance.now(),active=!overlay.hidden,version=0,hiddenAt=0;
 function finish(){if(!active)return;active=false;const current=version,remaining=matchMedia('(prefers-reduced-motion:reduce)').matches?0:Math.max(0,700-(performance.now()-started));setTimeout(()=>{if(current!==version)return;overlay.classList.add('startup-leaving');setTimeout(()=>{if(current!==version)return;overlay.hidden=true;document.documentElement.classList.remove('app-booting');},180);},remaining);}
 function resume(){const standalone=navigator.standalone===true||matchMedia('(display-mode:standalone)').matches;if(!standalone||!isAuthenticated())return;version++;started=performance.now();active=true;overlay.classList.remove('startup-leaving');overlay.hidden=false;document.documentElement.classList.add('app-booting');finish();}
 window.addEventListener('pageshow',e=>{if(e.persisted)resume();});document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=performance.now();else if(hiddenAt&&performance.now()-hiddenAt>30000){hiddenAt=0;resume();}});
 return {finish};
}
