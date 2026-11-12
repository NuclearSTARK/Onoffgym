import {cleanJpeg} from './media-service.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function avatarReference(owner,value){return uuid(owner)&&uuid(value?.id)&&value.path===`avatars/${owner}/${value.id}.jpg`?value:null;}
export function avatarSnapshot(preferences,members,viewer){const owners=new Map(members.map(m=>[m.id,m]));return Object.fromEntries(preferences.flatMap(p=>{const photo=avatarReference(p.user_id,p.body?.avatarPhoto),m=owners.get(p.user_id);return photo&&(p.user_id===viewer.id||viewer.role==='admin'||m?.status==='approved'&&m.disclosure_consent!==false)?[[p.user_id,photo.id]]:[];}));}
export function avatarJpeg(data){
 if(typeof data!=='string'||data.length>131072)fail('프로필 사진 크기를 줄여주세요.');let bytes;try{bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));}catch{fail('사진 형식을 확인해주세요.');}if(bytes.length>98304)fail('프로필 사진은 96KB 이하로 저장해주세요.');bytes=cleanJpeg(bytes);
 let width=0,height=0;for(let i=2;i+8<bytes.length;){const marker=bytes[i+1];if(marker===218)break;const size=(bytes[i+2]<<8)|bytes[i+3];if([192,193,194].includes(marker)){height=(bytes[i+5]<<8)|bytes[i+6];width=(bytes[i+7]<<8)|bytes[i+8];break;}i+=2+size;}
 if(width!==height||width<32||width>512)fail('프로필 사진을 다시 잘라 저장해주세요.');return bytes;
}
export function createAvatarService(db){
 const bucket=db.storage?.from('onoff-private-photos');
 async function result(q){const {data,error}=await q;if(error)fail('프로필 사진을 처리하지 못했어요. 다시 시도해주세요.',503);return data;}
 async function discard(path){try{const {error}=await bucket.remove([path]);if(error)await db.from('gym_photo_cleanup').upsert({path},{onConflict:'path'});}catch{await db.from('gym_photo_cleanup').upsert({path},{onConflict:'path'});}}
 return {async route(m,path,b){
  if(m.status!=='approved')fail('승인된 회원만 이용할 수 있어요.',403);
  // The authenticated account is the only writable owner; caller IDs are rejected.
  if('id' in b||'userId' in b||'user_id' in b||'path' in b)fail('본인 프로필에서 사진을 변경해주세요.',403);
  if(path==='/api/avatars/save'){
   if(m.disclosure_consent===false)fail('개인설정에서 회원 간 공개에 동의한 뒤 사진을 등록해주세요.',403);
   const bytes=avatarJpeg(b.data),id=crypto.randomUUID(),storagePath=`avatars/${m.id}/${id}.jpg`;
   if(!bucket)fail('사진 저장 연결을 확인해주세요.',503);
   await result(bucket.upload(storagePath,bytes,{contentType:'image/jpeg',cacheControl:'60',upsert:false}));
   try{await result(db.rpc('onoff_commit',{actor:m.id,op:'preferences',p:{avatarPhoto:{id,path:storagePath}}}));}catch(e){await discard(storagePath);throw e;}return {ok:true,id};
  }
  if(path==='/api/avatars/delete'){await result(db.rpc('onoff_commit',{actor:m.id,op:'preferences',p:{avatarPhoto:null}}));return {ok:true};}
  if(path==='/api/avatars/urls'){
   if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>24||b.ids.some(id=>!uuid(id)))fail('회원 사진 목록을 확인해주세요.');
   const ids=[...new Set(b.ids)],members=await result(db.from('gym_members').select('id,status,disclosure_consent,delete_requested_at').in('id',ids));
   const allowed=members.filter(owner=>!owner.delete_requested_at&&(owner.id===m.id||m.role==='admin'||owner.status==='approved'&&owner.disclosure_consent!==false)).map(owner=>owner.id);
   if(!allowed.length||!bucket)return {urls:[],expiresIn:60};
   const prefs=await result(db.from('gym_preferences').select('user_id,body').in('user_id',allowed));
   const photos=prefs.flatMap(p=>{const ref=avatarReference(p.user_id,p.body?.avatarPhoto);return ref?[{...ref,userId:p.user_id}]:[];});if(!photos.length)return {urls:[],expiresIn:60};
   const signed=await result(bucket.createSignedUrls(photos.map(p=>p.path),60));return {urls:photos.flatMap(p=>{const entry=signed.find(s=>s.path===p.path);return entry?.signedUrl?[{userId:p.userId,id:p.id,url:entry.signedUrl}]:[];}),expiresIn:60};
  }
  fail('프로필 사진 요청을 확인해주세요.',404);
 }};
}
