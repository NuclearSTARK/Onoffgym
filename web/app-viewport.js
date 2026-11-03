import {installScrollBoundaryGuard} from './scroll-boundary.js';
// Keep document scrolling native. Only the open dialog follows the visible
// viewport, including iOS keyboard panning (offsetTop) and device safe areas.
export function dialogFrame({width,height,top=0,left=0,safeTop=0,safeBottom=0,safeLeft=0,safeRight=0,contentHeight=height,editing=false}){
 const gap=12,available=Math.max(0,height-safeTop-safeBottom-gap*2),w=Math.max(0,Math.min(520,width-safeLeft-safeRight-gap*2));
 return {width:w,height:available,left:left+safeLeft+(width-safeLeft-safeRight-w)/2,top:top+safeTop+gap+(editing?0:Math.max(0,(available-Math.min(contentHeight,available))/2))};
}
export function installAppViewport(){
 installScrollBoundaryGuard();
 const html=document.documentElement,dialog=()=>document.querySelector('#modal');let frame=0,ensure=false,locked=null,baseline=window.innerHeight,keyboardOpen=false;
 const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';document.body.append(probe);
 const editable=el=>el?.matches?.('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),select')&&!el.disabled&&!el.readOnly;
 function keepVisible(){const el=document.activeElement,box=el?.closest?.('.modal-content');if(!box||!editable(el))return;const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),headroom=12,footroom=24;if(r.bottom>b.bottom-footroom)box.scrollTop+=r.bottom-b.bottom+footroom;if(el.getBoundingClientRect().top<b.top+headroom)box.scrollTop-=b.top+headroom-el.getBoundingClientRect().top;}
 function update(){frame=0;html.classList.remove('app-shell');html.style.removeProperty('--app-viewport-height');const vv=window.visualViewport,h=vv?.height||window.innerHeight;html.style.setProperty('--dialog-viewport-height',h+'px');
  // Hide tabs only for a keyboard-sized shrink after an editable field received
  // focus. Keep them hidden during the keyboard's closing animation too.
  keyboardOpen=baseline-h>120&&(editable(document.activeElement)||keyboardOpen);html.classList.toggle('mobile-keyboard-open',keyboardOpen);
  // The tab bar stays CSS-anchored; elastic viewport offsets must not move it.
  const d=dialog();if(!d?.open){baseline=Math.max(baseline,h);ensure=false;return;}
  const safe=getComputedStyle(probe),active=editable(document.activeElement)&&d.contains(document.activeElement),editing=active||h<baseline-120;
  d.classList.toggle('keyboard-open',h<baseline-120);d.classList.toggle('keyboard-compact',h<baseline-120&&h<250);
  const content=d.querySelector('.modal-content'),header=d.querySelector('.modal-head'),natural=(header?.offsetHeight||0)+(content?.scrollHeight||0)+2;
  const f=dialogFrame({width:vv?.width||window.innerWidth,height:h,top:vv?.offsetTop||0,left:vv?.offsetLeft||0,safeTop:parseFloat(safe.paddingTop)||0,safeBottom:parseFloat(safe.paddingBottom)||0,safeLeft:parseFloat(safe.paddingLeft)||0,safeRight:parseFloat(safe.paddingRight)||0,contentHeight:natural,editing});
  for(const [k,v]of Object.entries(f))d.style.setProperty('--dialog-'+k,v+'px');d.classList.add('viewport-dialog');
  if(ensure)keepVisible();ensure=false;
 }
 function refresh(reveal=false){ensure=ensure||reveal;if(!frame)frame=requestAnimationFrame(update);}
 function modalOpened(){if(!locked){locked={y:window.scrollY,x:window.scrollX};}refresh(true);}
 function modalClosed(){if(locked){const l=locked;locked=null;window.scrollTo({left:l.x,top:l.y,behavior:'instant'});}dialog()?.classList.remove('viewport-dialog','keyboard-open','keyboard-compact');refresh();}
 window.addEventListener('resize',()=>refresh(true),{passive:true});window.addEventListener('pageshow',()=>refresh());window.addEventListener('orientationchange',()=>{baseline=window.innerHeight;keyboardOpen=false;refresh(true);});window.visualViewport?.addEventListener('resize',()=>refresh(true),{passive:true});window.visualViewport?.addEventListener('scroll',()=>refresh(true),{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 document.addEventListener('focusin',e=>{if(editable(e.target)){refresh(true);setTimeout(()=>refresh(true),320);}});document.addEventListener('focusout',()=>setTimeout(()=>refresh(),0));document.addEventListener('input',e=>{if(editable(e.target)&&dialog()?.open)refresh(true);});
 const observer=new MutationObserver(()=>refresh());const d=dialog();if(d)observer.observe(d,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});refresh();
 return {top:()=>locked?.y??window.scrollY,to:(...args)=>window.scrollTo(...args),refresh:()=>refresh(),modalOpened,modalClosed};
}
