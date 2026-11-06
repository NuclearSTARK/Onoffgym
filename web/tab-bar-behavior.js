// Only a deliberate, mostly horizontal drag selects an adjacent tab; ends do not wrap.
export function swipeTab({index,count,dx,dy,slot}){
 const distance=Math.max(24,Math.min(40,slot*.4));
 if(index<0||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)<distance||Math.abs(dx)<Math.abs(dy)*1.25)return index;
 return Math.max(0,Math.min(count-1,index+Math.sign(dx)));
}
// Directional travel accumulates across scroll events, with a smaller reveal threshold.
export function createTabScrollVisibility(){
 let previous=0,direction=0,travel=0,hidden=false;
 function reveal(top=previous){previous=top;direction=0;travel=0;hidden=false;return hidden;}
 return {reveal,sample({top,max,blocked=false}){
  const limit=Math.max(0,max),y=Math.max(0,Math.min(limit,top));
  if(blocked||y<=20||limit-y<=20)return reveal(y);
  const delta=y-previous;previous=y;if(!delta)return hidden;
  const next=Math.sign(delta);travel=next===direction?travel+Math.abs(delta):Math.abs(delta);direction=next;
  if(next>0&&travel>=40)hidden=true;if(next<0&&travel>=12)hidden=false;
  return hidden;
 }};
}
