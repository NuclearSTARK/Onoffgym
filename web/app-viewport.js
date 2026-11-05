import {installScrollBoundaryGuard} from './scroll-boundary.js';
// Keep document scrolling native. Dialogs follow the visual viewport; the tab
// bar tracks its stable bottom rather than a cached iOS layout viewport.
export function dialogFrame({width,height,top=0,left=0,safeTop=0,safeBottom=0,safeLeft=0,safeRight=0,contentHeight=height,editing=false}){
 const gap=12,available=Math.max(0,height-safeTop-safeBottom-gap*2),w=Math.max(0,Math.min(520,width-safeLeft-safeRight-gap*2));
 return {width:w,height:available,left:left+safeLeft+(width-safeLeft-safeRight-w)/2,top:top+safeTop+gap+(editing?0:Math.max(0,(available-Math.min(contentHeight,available))/2))};
}
// Rubber-band offsets cannot extend the bottom beyond the layout viewport.
// A newly expanded visual viewport may legitimately be taller than stale layout metrics.
export function navigationViewportBottom({height,layoutHeight,offsetTop=0,scale=1}){
 if(!Number.isFinite(scale)||Math.abs(scale-1)>.02)return null;
 const h=Number.isFinite(height)&&height>0?height:layoutHeight;if(!Number.isFinite(h)||h<=0)return null;
 const layout=Number.isFinite(layoutHeight)&&layoutHeight>0?layoutHeight:h,pan=Number.isFinite(offsetTop)?Math.max(0,offsetTop):0;
 return Math.round((h+Math.min(pan,Math.max(0,layout-h)))*1000)/1000;
}
export function installAppViewport(){
 installScrollBoundaryGuard();
 const html=document.documentElement,dialog=()=>document.querySelector('#modal');let settling=[];let frame=0,ensure=false,locked=null,baseline=window.innerHeight,baselineWidth=window.innerWidth,keyboardOpen=false;
 const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';document.body.append(probe);
 const editable=el=>el?.matches?.('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),select')&&!el.disabled&&!el.readOnly;
 function keepVisible(){const el=document.activeElement,box=el?.closest?.('.modal-content');if(!box||!editable(el))return;const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),headroom=12,footroom=24;if(r.bottom>b.bottom-footroom)box.scrollTop+=r.bottom-b.bottom+footroom;if(el.getBoundingClientRect().top<b.top+headroom)box.scrollTop-=b.top+headroom-el.getBoundingClientRect().top;}
 const header=document.querySelector('.app-header');const syncHeader=()=>{const app=document.querySelector('.app'),main=document.querySelector('#main'),left=app?.getBoundingClientRect().left||0;html.style.setProperty('--app-header-left',left+'px');if(main)html.style.setProperty('--app-content-inset',(main.getBoundingClientRect().left-left+(parseFloat(getComputedStyle(main).paddingLeft)||0))+'px');html.style.setProperty('--app-header-height',(header?.getBoundingClientRect().height||0)+'px');};if(header)new ResizeObserver(syncHeader).observe(header);syncHeader();
 function update(){frame=0;syncHeader();html.classList.remove('app-shell');html.style.removeProperty('--app-viewport-height');const vv=window.visualViewport,h=vv?.height||window.innerHeight,width=vv?.width||window.innerWidth;if(Math.abs(width-baselineWidth)>80){baseline=h;baselineWidth=width;keyboardOpen=false;}html.style.setProperty('--dialog-viewport-height',h+'px');
  // Hide tabs only for a keyboard-sized shrink after an editable field received
  // focus. Keep them hidden during the keyboard's closing animation too.
  keyboardOpen=baseline-h>120&&(editable(document.activeElement)||keyboardOpen);html.classList.toggle('mobile-keyboard-open',keyboardOpen);
  const bottom=navigationViewportBottom({height:h,layoutHeight:window.innerHeight,offsetTop:vv?.offsetTop||0,scale:vv?.scale??1});html.classList.toggle('nav-viewport-anchored',bottom!==null);if(bottom!==null)html.style.setProperty('--mobile-nav-viewport-bottom',bottom+'px');else html.style.removeProperty('--mobile-nav-viewport-bottom');
  const d=dialog();if(!d?.open){baseline=Math.max(baseline,h);ensure=false;return;}
  const safe=getComputedStyle(probe),active=editable(document.activeElement)&&d.contains(document.activeElement),editing=keyboardOpen;
  d.classList.toggle('keyboard-open',keyboardOpen);d.classList.toggle('keyboard-compact',keyboardOpen&&h<250);
  const content=d.querySelector('.modal-content'),header=d.querySelector('.modal-head'),natural=(header?.offsetHeight||0)+(content?.scrollHeight||0)+2;
  const f=dialogFrame({width:vv?.width||window.innerWidth,height:h,top:vv?.offsetTop||0,left:vv?.offsetLeft||0,safeTop:parseFloat(safe.paddingTop)||0,safeBottom:parseFloat(safe.paddingBottom)||0,safeLeft:parseFloat(safe.paddingLeft)||0,safeRight:parseFloat(safe.paddingRight)||0,contentHeight:natural,editing});
  for(const [k,v]of Object.entries(f))d.style.setProperty('--dialog-'+k,v+'px');d.classList.add('viewport-dialog');
  if(ensure)keepVisible();ensure=false;
 }
 function refresh(reveal=false){ensure=ensure||reveal;if(!frame)frame=requestAnimationFrame(update);}
 const contentObserver=new ResizeObserver(()=>refresh());let observedThread=null;function observeContent(){const thread=dialog()?.querySelector('.post-thread,.privacy-document,.named-description');if(thread!==observedThread){if(observedThread)contentObserver.unobserve(observedThread);observedThread=thread;if(thread)contentObserver.observe(thread);}}
 function settle(reveal=false){settling.forEach(timer=>clearTimeout(timer));refresh(reveal);settling=[80,250,500].map(delay=>setTimeout(()=>refresh(reveal),delay));}
 function modalOpened(){if(!locked){locked={y:window.scrollY,x:window.scrollX};}refresh(true);}
 function modalClosed(){if(locked){const l=locked;locked=null;window.scrollTo({left:l.x,top:l.y,behavior:'instant'});}dialog()?.classList.remove('viewport-dialog','keyboard-open','keyboard-compact');settle();}
 window.addEventListener('resize',()=>refresh(true),{passive:true});window.addEventListener('pageshow',()=>settle());window.addEventListener('orientationchange',()=>{baseline=window.innerHeight;keyboardOpen=false;settle(true);});window.visualViewport?.addEventListener('resize',()=>refresh(true),{passive:true});window.visualViewport?.addEventListener('scroll',()=>refresh(true),{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)settle();});
 document.addEventListener('focusin',e=>{if(editable(e.target)){refresh(true);setTimeout(()=>refresh(true),320);}});document.addEventListener('focusout',()=>settle());document.addEventListener('input',e=>{if(editable(e.target)&&dialog()?.open)refresh(true);});
 document.addEventListener('load',event=>{if(event.target?.matches?.('img')&&event.target.closest('#modal'))refresh();},true);document.fonts?.ready.then(()=>refresh());
 const observer=new MutationObserver(()=>{observeContent();refresh();});const d=dialog();if(d)observer.observe(d,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});refresh();
 return {top:()=>locked?.y??window.scrollY,to:(...args)=>window.scrollTo(...args),refresh:()=>refresh(),navigationChanged:()=>settle(),modalOpened,modalClosed};
}
