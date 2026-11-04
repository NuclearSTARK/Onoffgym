// Authenticated bytes only. A bootstrap/signing grant is required by photos.js
// before any persistent read. Account transitions serialize deletion with writes.
export function createPhotoStorage({storage=globalThis.caches,now=()=>Date.now(),origin=globalThis.location?.origin||'https://onoff.invalid',limit=60,ttl=86400000}={}){
 const prefix='onoff-photos-v2-';let owner=null,generation=0,queue=Promise.resolve();
 const run=task=>{const result=queue.then(task).catch(()=>null);queue=result.then(()=>{});return result;};
 const key=(who,id,variant)=>origin+'/__onoff_photo_cache__/'+encodeURIComponent(who)+'/'+variant+'/'+encodeURIComponent(id);
 const valid=(who,version)=>who&&owner===who&&generation===version;
 return {
  owner(value){value=value||'';if(owner===value)return queue;owner=value;generation++;const who=owner,version=generation;return run(async()=>{if(!storage||owner!==who||generation!==version)return;for(const name of await storage.keys())if(name.startsWith(prefix)&&name!==prefix+who)await storage.delete(name);});},
  get(id,variant){const who=owner,version=generation;return run(async()=>{if(!storage||!valid(who,version))return null;const bucket=await storage.open(prefix+who);if(!valid(who,version))return null;const response=await bucket.match(key(who,id,variant));if(!response)return null;if(Number(response.headers.get('X-OnOff-Saved'))+ttl<now()){await bucket.delete(key(who,id,variant));return null;}const blob=await response.blob();return valid(who,version)?blob:null;});},
  put(id,variant,blob){const who=owner,version=generation;return run(async()=>{if(!storage||!valid(who,version)||blob.type!=='image/jpeg'||blob.size>614400)return;const bucket=await storage.open(prefix+who);if(!valid(who,version))return;await bucket.delete(key(who,id,variant));await bucket.put(key(who,id,variant),new Response(blob,{headers:{'Content-Type':'image/jpeg','X-OnOff-Saved':String(now())}}));if(!valid(who,version)){await storage.delete(prefix+who);return;}const keys=await bucket.keys();for(const entry of keys.slice(0,Math.max(0,keys.length-limit)))await bucket.delete(entry);});},
  remove(id){const who=owner,version=generation;return run(async()=>{if(!storage||!valid(who,version))return;const bucket=await storage.open(prefix+who);await Promise.all(['preview','full'].map(v=>bucket.delete(key(who,id,v))));});},
  purge(){owner='';generation++;return run(async()=>{if(storage)for(const name of await storage.keys())if(name.startsWith(prefix))await storage.delete(name);});}
 };
}
export const photoStorage=createPhotoStorage();
export const purgePhotoStorage=()=>photoStorage.purge();
