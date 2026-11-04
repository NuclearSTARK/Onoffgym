import {hasPermission} from '../../../web/permissions.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
// Accept only canvas-produced JPEGs and drop APP/COM metadata defensively.
export function cleanJpeg(bytes){if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)fail('JPEG 사진을 선택해주세요.');const parts=[bytes.subarray(0,2)];let i=2;while(i<bytes.length){if(bytes[i]!==255)fail('사진 형식을 확인해주세요.');const marker=bytes[i+1];if(marker===218){parts.push(bytes.subarray(i));const output=new Uint8Array(bytes.length);let length=0;for(const part of parts){output.set(part,length);length+=part.length;}return output.slice(0,length);}const size=(bytes[i+2]<<8)|bytes[i+3];if(size<2||i+2+size>bytes.length)fail('사진 파일이 손상됐어요.');if(!(marker>=224&&marker<=239)&&marker!==254)parts.push(bytes.subarray(i,i+2+size));i+=2+size;}fail('사진 파일을 확인해주세요.');}
export function createMediaService(db,{now=()=>new Date()}={}){
 const bucket=db.storage?.from('onoff-private-photos');
 async function result(q){const {data,error}=await q;if(error)fail(error.code==='42501'?'사진 접근 권한이 없어요.':'사진을 저장하지 못했어요. 다시 시도해주세요.',error.code==='42501'?403:503);return data;}
 async function cleanup(){if(!bucket)return;try{const stale=await result(db.from('gym_photos').select('id').eq('active',false).lt('created_at',new Date(+now()-86400000).toISOString()).limit(30));if(stale.length)await result(db.from('gym_photos').delete().in('id',stale.map(p=>p.id)));const pending=await result(db.from('gym_photo_cleanup').select('path').limit(30));if(pending.length){const paths=pending.map(x=>x.path);const {error}=await bucket.remove(paths);if(!error)await result(db.from('gym_photo_cleanup').delete().in('path',paths));}}catch{/* Durable outbox retries on the next authenticated request. */}}
 async function visiblePhotos(m,photos){if(m?.role==='admin')return photos;const ids=[...new Set(photos.map(p=>p.owner_id).filter(id=>id&&id!==m?.id))];const owners=ids.length?await result(db.from('gym_members').select('id,status,disclosure_consent').in('id',ids)):[];return photos.filter(p=>!p.owner_id||p.owner_id===m?.id||owners.some(o=>o.id===p.owner_id&&o.status==='approved'&&o.disclosure_consent!==false));}
 async function route(m,path,b){if(m.status!=='approved')fail('승인된 회원만 이용할 수 있어요.',403);
  if(path==='/api/photos/upload'){if(m.disclosure_consent===false)fail('사진 공개에 동의한 뒤 이용해주세요.',403);
   if(!['community','daily','notice'].includes(b.kind)||b.kind==='daily'&&!hasPermission(m,'photos')||b.kind==='notice'&&!hasPermission(m,'notices'))fail('사진 관리 권한이 필요해요.',403);
   if(typeof b.data!=='string'||b.data.length>820000)fail('압축된 사진은 600KB 이하여야 해요.');let bytes;try{bytes=Uint8Array.from(atob(b.data),c=>c.charCodeAt(0));}catch{fail('사진 파일을 확인해주세요.');}bytes=cleanJpeg(bytes);if(bytes.length>614400)fail('사진 크기를 줄여주세요.');
   await cleanup();const pending=await result(db.from('gym_photos').select('id').eq('owner_id',m.id).eq('active',false).limit(10));if(pending.length>=10)fail('미사용 사진이 많아요. 잠시 후 다시 시도해주세요.',429);const id=crypto.randomUUID(),storagePath=m.id+'/'+id+'.jpg';
   await result(db.from('gym_photos').insert({id,owner_id:m.id,kind:b.kind,path:storagePath}));
   const {error}=await bucket.upload(storagePath,bytes,{contentType:'image/jpeg',cacheControl:'60',upsert:false});if(error){await result(db.from('gym_photos').delete().eq('id',id).eq('owner_id',m.id));fail('사진 업로드 실패 · 다시 시도하면 재업로드합니다.',503);}
   await result(db.from('gym_photos').update({uploaded:true}).eq('id',id).eq('owner_id',m.id));return {id};
  }
  if(path==='/api/photos/urls'){
   if(!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>12||b.ids.some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id)))fail('사진 목록을 확인해주세요.');
   const photos=await visiblePhotos(m,await result(db.from('gym_photos').select('id,path,owner_id').eq('active',true).in('id',[...new Set(b.ids)])));if(!photos.length)return {urls:[]};
   const {data,error}=await bucket.createSignedUrls(photos.map(p=>p.path),60);if(error)fail('사진을 불러오지 못했어요.',503);return {urls:photos.flatMap(p=>{const signed=data.find(x=>x.path===p.path);return signed?.signedUrl?[{id:p.id,url:signed.signedUrl}]:[];}),expiresIn:60};
  }
  if(path==='/api/photos/program'){if(!hasPermission(m,'photos'))fail('사진 관리 권한이 필요해요.',403);return result(db.rpc('onoff_photo_program',{actor:m.id,photo_id:b.id,target_program:b.program}));}
  if(path==='/api/photos/url'){
   const photo=await result(db.from('gym_photos').select('*').eq('id',b.id).eq('active',true).maybeSingle());if(!photo||!(await visiblePhotos(m,[photo])).length)fail('사진을 찾을 수 없어요.',404);
   const {data,error}=await bucket.createSignedUrl(photo.path,60);if(error)fail('사진을 불러오지 못했어요.',503);return {url:data.signedUrl,expiresIn:60};
  }
  if(path==='/api/photos/attach'){if(b.kind!=='daily')fail('사진 종류를 확인해주세요.');if(!hasPermission(m,'photos'))fail('사진 관리 권한이 필요해요.',403);return result(db.rpc('onoff_attach_photos',{actor:m.id,p:b}));}
  if(path==='/api/photos/delete'){
   const photo=await result(db.from('gym_photos').select('*').eq('id',b.id).maybeSingle());if(!photo)fail('사진을 찾을 수 없어요.',404);
   if(photo.active?photo.kind==='daily'?!hasPermission(m,'photos'):photo.kind==='notice'?!hasPermission(m,'notices'):m.role!=='admin':photo.owner_id!==m.id)fail('사진 삭제 권한이 없어요.',403);
   await result(db.from('gym_photos').delete().eq('id',photo.id));await cleanup();return {ok:true};
  }
  fail('사진 요청을 확인해주세요.',404);
 }
 async function list(date,postIds,noticeIds=[],member){if(!bucket)return [];const fields='id,kind,post_id,notice_id,date,program,session,owner_id';const [daily,community,notices]=await Promise.all([result(db.from('gym_photos').select(fields).eq('active',true).eq('kind','daily').eq('date',date)),postIds.length?result(db.from('gym_photos').select(fields).eq('active',true).in('post_id',postIds)):[],noticeIds.length?result(db.from('gym_photos').select(fields).eq('active',true).in('notice_id',noticeIds)):[]]);return (await visiblePhotos(member,[...daily,...community,...notices])).map(({owner_id,...photo})=>photo);}
 return {route,list,cleanup};
}
