// A deliberate bar drag lands on the nearest visible tab; ends never wrap.
export function swipeTab({index,count,dx,dy,slot,position=index+dx/slot}){
 if(index<0||count<1||!Number.isFinite(slot)||slot<=0||!Number.isFinite(position)||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.25)return index;
 return Math.max(0,Math.min(count-1,Math.round(position)));
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
