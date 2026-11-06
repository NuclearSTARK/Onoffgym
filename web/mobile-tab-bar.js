import {swipeTab,createTabScrollVisibility} from './tab-bar-behavior.js';
// One persistent selection pane follows confirmed routes, including back/forward.
// A new tap preserves the current spring position and velocity rather than jumping.
export function tabSpring({position,velocity=0,target,time,frequency=19,damping=.55}){
 const a=damping*frequency,w=frequency*Math.sqrt(1-damping*damping),d=position-target,b=(velocity+a*d)/w,e=Math.exp(-a*Math.max(0,time)),c=Math.cos(w*Math.max(0,time)),s=Math.sin(w*Math.max(0,time));
 return {position:target+e*(d*c+b*s),velocity:e*((-a*d+w*b)*c+(-a*b-w*d)*s)};
}
export function tabSelectionBounds({left,right,min,max,radius=30}){
 const width=Math.min(max-min,Math.max(Math.min(radius*2,max-min),right-left)),middle=Math.max(min+width/2,Math.min(max-width/2,(left+right)/2));
 return {left:middle-width/2,width};
}
export function createMobileTabBar(nav,{navigate}={}){
 const pane=document.createElement('span');pane.className='nav-selection';pane.setAttribute('aria-hidden','true');pane.hidden=true;nav.prepend(pane);nav.classList.add('has-tab-selection');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let buttons=[],signature='',selected='',visible=false,geometry=null,frame=0,started=0,edges=null;
 const cancel=()=>{if(frame)cancelAnimationFrame(frame);frame=0;pane.removeAttribute('data-moving');};
 function measure(){const width=nav.clientWidth;if(!width||nav.hidden)return null;const style=getComputedStyle(nav),inset=parseFloat(style.paddingLeft)||10;return {width,inset,slot:(width-2*inset)/buttons.length};}
 const target=()=>{const index=buttons.findIndex(b=>b.dataset.page===selected);if(!geometry||index<0)return null;return {left:geometry.inset+geometry.slot*index+1,right:geometry.inset+geometry.slot*(index+1)-1};};
 function paint(left,right){const box=tabSelectionBounds({left,right,min:geometry.inset,max:geometry.width-geometry.inset,radius:parseFloat(getComputedStyle(nav).borderTopLeftRadius)||30});pane.style.left=box.left+'px';pane.style.width=box.width+'px';pane.hidden=false;}
 function snap(){cancel();geometry=measure();const t=target();if(!visible||!t){pane.hidden=true;edges=null;return;}edges={left:{position:t.left,velocity:0,target:t.left},right:{position:t.right,velocity:0,target:t.right}};paint(t.left,t.right);}
 function sample(now){const time=(now-started)/1000;return Object.fromEntries(Object.entries(edges).map(([key,edge])=>[key,{...edge,...tabSpring({...edge,time})}]));}
 function tick(now){frame=0;if(!visible||!geometry||!edges)return;const current=sample(now);paint(current.left.position,current.right.position);if(Object.values(current).every(e=>Math.abs(e.position-e.target)<.04&&Math.abs(e.velocity)<.4)||now-started>1600){snap();return;}frame=requestAnimationFrame(tick);}
 function move(){const t=target();if(!t||!visible){snap();return;}if(!edges||pane.hidden||reduced.matches){snap();return;}const now=performance.now(),current=frame?sample(now):edges,direction=(t.left+t.right)-(current.left.position+current.right.position);cancel();edges={};for(const side of ['left','right']){const leading=direction>=0?side==='right':side==='left';edges[side]={position:current[side].position,velocity:current[side].velocity,target:t[side],frequency:leading?19:11,damping:leading?.55:.72};}started=now;pane.dataset.moving='';frame=requestAnimationFrame(tick);}
 const mobile=matchMedia('(max-width:760px)'),scrollState=createTabScrollVisibility();
 let pointer=null,suppressClickUntil=0,scrollFrame=0,revealUntil=0,lastRoute='',autoHidden=false;
 function scrollMetrics(){const root=document.scrollingElement;return {top:root?.scrollTop||0,max:Math.max(0,(root?.scrollHeight||0)-Math.min(root?.clientHeight||innerHeight,window.visualViewport?.height||innerHeight))};}
 function setScrollHidden(hidden){if(hidden===autoHidden)return;autoHidden=hidden;nav.toggleAttribute('data-scroll-hidden',hidden);nav.inert=hidden;if(hidden)nav.setAttribute('aria-hidden','true');else nav.removeAttribute('aria-hidden');}
 function reveal(hold=500){scrollState.reveal(scrollMetrics().top);revealUntil=performance.now()+hold;setScrollHidden(false);}
 function blocked(){return !visible||!mobile.matches||!!pointer||document.documentElement.classList.contains('mobile-keyboard-open')||document.documentElement.classList.contains('photo-viewing')||!!document.querySelector('dialog[open]')||document.body.classList.contains('timer-immersive')||Math.abs((window.visualViewport?.scale||1)-1)>.02||!!nav.querySelector(':focus-visible')||performance.now()<revealUntil;}
 function updateScroll(){scrollFrame=0;setScrollHidden(scrollState.sample({...scrollMetrics(),blocked:blocked()}));}
 window.addEventListener('scroll',e=>{if(e.target!==document&&e.target!==window)return;if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);},{passive:true});
 function savePane(){if(!geometry||pane.hidden)return;edges={left:{position:parseFloat(pane.style.left),velocity:0},right:{position:parseFloat(pane.style.left)+parseFloat(pane.style.width),velocity:0}};}
 function finishPointer(cancelled=false,event){const current=pointer;if(!current)return;pointer=null;nav.removeAttribute('data-dragging');if(nav.hasPointerCapture?.(current.id))nav.releasePointerCapture(current.id);if(!current.dragging)return;
  const dx=event?.clientX-current.x||0,dy=event?.clientY-current.y||0;if(!cancelled)paint(current.left+dx,current.right+dx);
  suppressClickUntil=performance.now()+500;savePane();reveal();
  const position=((edges.left.position+edges.right.position)/2-geometry.inset)/geometry.slot-.5;
  const next=cancelled?current.index:swipeTab({index:current.index,count:buttons.length,dx,dy,slot:geometry.slot,position});
  if(next!==current.index){if(navigate)navigate(buttons[next].dataset.page);else buttons[next].click();}
  // Navigation may be rejected by an unsaved form. Return to the confirmed tab.
  if(selected===current.selected)move();
 }
 nav.addEventListener('pointerdown',e=>{
  suppressClickUntil=0;
  if(!e.isPrimary){finishPointer(true);return;}
  const index=buttons.findIndex(b=>b.dataset.page===selected);
  if(e.button!==0||!visible||!mobile.matches||autoHidden||index<0||document.querySelector('dialog[open]'))return;
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,index,selected,dragging:false};reveal();
 });
 document.addEventListener('pointerdown',e=>{if(pointer&&e.pointerId!==pointer.id)finishPointer(true);},{capture:true,passive:true});
 nav.addEventListener('pointermove',e=>{const p=pointer;if(!p||p.id!==e.pointerId)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
  if(!p.dragging){if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;if(Math.abs(dy)>=Math.abs(dx)){pointer=null;return;}if(Math.abs(dx)<Math.abs(dy)*1.25)return;
   geometry=measure();if(!geometry){pointer=null;return;}cancel();p.left=parseFloat(pane.style.left);p.right=p.left+parseFloat(pane.style.width);p.dragging=true;nav.dataset.dragging='';nav.setPointerCapture(e.pointerId);
  }
  if(e.cancelable)e.preventDefault();paint(p.left+dx,p.right+dx);
 });
 nav.addEventListener('pointerup',e=>{if(pointer?.id===e.pointerId)finishPointer(false,e);});
 nav.addEventListener('pointercancel',e=>{if(pointer?.id===e.pointerId)finishPointer(true);});
 nav.addEventListener('lostpointercapture',e=>{if(e.target===nav&&pointer?.id===e.pointerId)finishPointer(true);});
 nav.addEventListener('click',e=>{if(e.detail>0&&performance.now()<suppressClickUntil){suppressClickUntil=0;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 nav.addEventListener('focusin',()=>reveal());
 document.addEventListener('keydown',e=>{if(e.key==='Tab')reveal();});
 const resetInteraction=()=>{finishPointer(true);reveal();};
 window.addEventListener('resize',resetInteraction,{passive:true});window.addEventListener('orientationchange',resetInteraction);window.addEventListener('pageshow',resetInteraction);window.visualViewport?.addEventListener('resize',resetInteraction,{passive:true});mobile.addEventListener('change',resetInteraction);
 const modal=document.querySelector('#modal');if(modal)new MutationObserver(resetInteraction).observe(modal,{attributes:true,attributeFilter:['open']});
 let keyboardWasOpen=false,photoWasOpen=false;new MutationObserver(()=>{const keyboard=document.documentElement.classList.contains('mobile-keyboard-open'),photo=document.documentElement.classList.contains('photo-viewing');if(keyboard!==keyboardWasOpen||photo!==photoWasOpen){keyboardWasOpen=keyboard;photoWasOpen=photo;resetInteraction();}}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 const observer=new ResizeObserver(()=>snap());observer.observe(nav);reduced.addEventListener('change',snap);document.addEventListener('visibilitychange',()=>{finishPointer(true);if(document.hidden)snap();else reveal();});
 return {render({items,active,route=active,hidden=false}){
  if(route!==lastRoute){finishPointer(true);lastRoute=route;reveal();}
  const nextSignature=items.map(x=>x.id).join('|'),changed=signature!==nextSignature,wasVisible=visible,previous=selected;nav.hidden=hidden;visible=!hidden;selected=active;
  if(changed){buttons.forEach(b=>b.remove());buttons=items.map(item=>{const b=document.createElement('button');b.type='button';b.dataset.page=item.id;b.innerHTML='<span class="nav-icon"></span><span class="nav-label"></span>';nav.append(b);return b;});signature=nextSignature;}
  items.forEach((item,i)=>{const b=buttons[i],icon=b.querySelector('.nav-icon');if(icon.innerHTML!==item.icon)icon.innerHTML=item.icon;b.querySelector('.nav-label').textContent=item.label;const isActive=item.id===active;b.classList.toggle('active',isActive);if(isActive)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(changed||!wasVisible||!visible){finishPointer(true);reveal();snap();return;}if(previous!==selected){geometry=measure();move();}
 }};
}
