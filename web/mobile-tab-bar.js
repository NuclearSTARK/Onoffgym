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
export function createMobileTabBar(nav){
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
 const observer=new ResizeObserver(()=>snap());observer.observe(nav);reduced.addEventListener('change',snap);document.addEventListener('visibilitychange',()=>{if(document.hidden)snap();});
 return {render({items,active,hidden=false}){
  const nextSignature=items.map(x=>x.id).join('|'),changed=signature!==nextSignature,wasVisible=visible,previous=selected;nav.hidden=hidden;visible=!hidden;selected=active;
  if(changed){buttons.forEach(b=>b.remove());buttons=items.map(item=>{const b=document.createElement('button');b.type='button';b.dataset.page=item.id;b.innerHTML='<span class="nav-icon"></span><span class="nav-label"></span>';nav.append(b);return b;});signature=nextSignature;}
  items.forEach((item,i)=>{const b=buttons[i],icon=b.querySelector('.nav-icon');if(icon.innerHTML!==item.icon)icon.innerHTML=item.icon;b.querySelector('.nav-label').textContent=item.label;const isActive=item.id===active;b.classList.toggle('active',isActive);if(isActive)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(changed||!wasVisible||!visible){snap();return;}if(previous!==selected){geometry=measure();move();}
 }};
}
