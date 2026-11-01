// Use ordinary document flow. Only dialogs adapt to the keyboard's visible area.
// The app and navigation never get a synthetic viewport height or scroll frame.
export function installAppViewport(){
 function refresh(){document.documentElement.classList.remove('app-shell');document.documentElement.style.removeProperty('--app-viewport-height');const h=window.visualViewport?.height||window.innerHeight;if(h>0)document.documentElement.style.setProperty('--dialog-viewport-height',h+'px');}
 window.addEventListener('resize',refresh,{passive:true});window.addEventListener('pageshow',refresh);window.addEventListener('orientationchange',refresh);window.visualViewport?.addEventListener('resize',refresh,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});refresh();
 return {top:()=>window.scrollY,to:(...args)=>window.scrollTo(...args),refresh};
}
