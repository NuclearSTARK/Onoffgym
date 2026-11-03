// Expired access blocks display until reauthorization, while the bounded in-memory
// binary can survive briefly to avoid downloading an unchanged photo again.
export function createPhotoCache({now=()=>Date.now(),revoke=()=>{},limit=24,ttl=55000,retain=0}={}){
 const values=new Map();let owner='';
 const remove=id=>{const entry=values.get(id);if(entry){values.delete(id);revoke(entry.url);}};
 const entryFor=id=>{const entry=values.get(id);if(entry&&entry.retainedUntil<=now()){remove(id);return null;}return entry||null;};
 const touch=(id,entry)=>{values.delete(id);values.set(id,entry);return entry.url;};
 return {owner(value){if(value!==owner){for(const id of values.keys())remove(id);owner=value;}},get(id){const entry=entryFor(id);if(!entry||entry.expires<=now())return null;return touch(id,entry);},authorize(id){const entry=entryFor(id);if(!entry)return null;entry.expires=now()+ttl;return touch(id,entry);},set(id,url){remove(id);values.set(id,{url,expires:now()+ttl,retainedUntil:now()+ttl+retain});while(values.size>limit)remove(values.keys().next().value);return url;},remove,clear(){for(const id of values.keys())remove(id);},get size(){return values.size;}};
}
