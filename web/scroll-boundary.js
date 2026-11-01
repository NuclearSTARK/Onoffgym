// Keep outward touch drags from rubber-banding the root page and its fixed tabs.
// Nested lists, textareas, horizontal carousels and multi-touch keep native input.
export function installScrollBoundaryGuard(){
 let point=null;
 document.addEventListener('touchstart',e=>{point=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
 document.addEventListener('touchend',()=>{point=null;},{passive:true});document.addEventListener('touchcancel',()=>{point=null;},{passive:true});
 document.addEventListener('touchmove',e=>{
  if(!point||e.touches.length!==1||!e.cancelable||!matchMedia('(max-width:760px)').matches)return;
  if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const p=e.touches[0],dx=p.clientX-point.x,dy=p.clientY-point.y;point={x:p.clientX,y:p.clientY};
  if(Math.abs(dy)<1||Math.abs(dx)>Math.abs(dy)||document.getSelection()?.isCollapsed===false)return;
  const canMove=el=>dy>0?el.scrollTop>0:el.scrollTop+el.clientHeight<el.scrollHeight-1;
  for(let el=e.target instanceof Element?e.target:null;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
   const style=getComputedStyle(el);
   if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+1){
    if(canMove(el))return;
    if(['contain','none'].includes(style.overscrollBehaviorY)){e.preventDefault();return;}
   }
  }
  const root=document.scrollingElement;if(root&&!canMove(root))e.preventDefault();
 },{passive:false});
}
