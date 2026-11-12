import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avatarJpeg,avatarReference,avatarSnapshot,createAvatarService} from '../supabase/functions/onoff-api/avatar-service.js';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',privateId='10000000-0000-4000-8000-000000000003',paused='10000000-0000-4000-8000-000000000004',photo='20000000-0000-4000-8000-000000000001';
const ref=id=>({id:photo,path:`avatars/${id}/${photo}.jpg`});
const jpeg=Buffer.from([255,216,255,225,0,4,1,2,255,192,0,17,8,2,0,2,0,3,1,17,0,2,17,0,3,17,0,255,218,0,2,0,255,217]).toString('base64');
function fixture({commitError=false,uploadError=false}={}){
 const writes=[],uploaded=[],removed=[],signed=[];
 const tables={
  gym_members:[{id:owner,status:'approved'},{id:other,status:'approved',disclosure_consent:true},{id:privateId,status:'approved',disclosure_consent:false},{id:paused,status:'suspended'}],
  gym_preferences:[owner,other,privateId,paused].map(user_id=>({user_id,body:{avatarPhoto:ref(user_id)}}))
 };
 const db={
  from(name){
   let data=tables[name]||[];
   const q={select(){return q},in(key,ids){data=data.filter(row=>ids.includes(row[key]));return q},upsert(value){writes.push(value);return Promise.resolve({data:value})},then(resolve,reject){return Promise.resolve({data}).then(resolve,reject)}};
   return q;
  },
  rpc(name,args){writes.push(args);return Promise.resolve(commitError?{error:{code:'503'}}:{data:{ok:true}});},
  storage:{from(name){
   assert.equal(name,'onoff-private-photos');
   return {
    async upload(path,bytes,opts){uploaded.push({path,bytes,opts});return uploadError?{error:{}}:{data:{path}};},
    async remove(paths){removed.push(...paths);return {data:[]};},
    async createSignedUrls(paths,seconds){signed.push({paths,seconds});return {data:paths.map(path=>({path,signedUrl:'https://test.invalid/'+path}))};}
   };
  }}
 };
 return {service:createAvatarService(db),writes,uploaded,removed,signed,tables};
}

test('avatar bytes are bounded square JPEGs and discard metadata before storage',()=>{const clean=avatarJpeg(jpeg);assert.equal(clean[3],192);assert.throws(()=>avatarJpeg('not jpeg'));assert.throws(()=>avatarJpeg('a'.repeat(131073)));const invalid=Buffer.from(jpeg,'base64');invalid[16]=1;assert.throws(()=>avatarJpeg(invalid.toString('base64')));});
test('profile photos never accept external paths, alternate owners, private sharing or suspended accounts',async()=>{assert.equal(avatarReference(owner,ref(other)),null);const f=fixture(),member={id:owner,status:'approved',role:'member'};for(const payload of [{userId:other,data:jpeg},{user_id:other,data:jpeg},{id:other,data:jpeg},{path:ref(other).path,data:jpeg}])await assert.rejects(()=>f.service.route(member,'/api/avatars/save',payload),e=>e.status===403);for(const status of ['pending','suspended'])await assert.rejects(()=>f.service.route({...member,status},'/api/avatars/save',{data:jpeg}),e=>e.status===403);await assert.rejects(()=>f.service.route({...member,disclosure_consent:false},'/api/avatars/save',{data:jpeg}),e=>e.status===403);assert.equal(f.uploaded.length,0);assert.equal(f.writes.length,0);});
test('upload binds the authenticated owner, uses a private immutable path, and cleans failed commits',async()=>{for(const commitError of [false,true]){const f=fixture({commitError});const task=f.service.route({id:owner,status:'approved'},'/api/avatars/save',{data:jpeg});if(commitError)await assert.rejects(()=>task,e=>e.status===503);else assert.equal((await task).ok,true);assert.equal(f.writes[0].actor,owner);assert.equal(f.writes[0].op,'preferences');const photo=f.writes[0].p.avatarPhoto;assert.deepEqual(avatarReference(owner,photo),photo);assert.equal(f.uploaded[0].path,photo.path);assert.equal(f.uploaded[0].opts.upsert,false);assert.equal(f.removed.length,commitError?1:0);}const f=fixture({uploadError:true});await assert.rejects(()=>f.service.route({id:owner,status:'approved'},'/api/avatars/save',{data:jpeg}));assert.equal(f.writes.length,0);});
test('photo deletion clears only the authenticated account reference for durable cleanup',async()=>{const f=fixture();await f.service.route({id:owner,status:'approved'},'/api/avatars/delete',{});assert.deepEqual(f.writes,[{actor:owner,op:'preferences',p:{avatarPhoto:null}}]);});
test('bootstrap and signed photo reads honor approval, disclosure, own-account access and operator visibility',async()=>{const f=fixture(),viewer={id:owner,status:'approved',role:'member'};assert.deepEqual(Object.keys(avatarSnapshot(f.tables.gym_preferences,f.tables.gym_members,viewer)),[owner,other]);let result=await f.service.route(viewer,'/api/avatars/urls',{ids:[owner,other,privateId,paused]});assert.deepEqual(result.urls.map(r=>r.userId),[owner,other]);assert.equal(f.signed[0].seconds,60);result=await f.service.route({...viewer,role:'admin'},'/api/avatars/urls',{ids:[privateId,paused]});assert.deepEqual(result.urls.map(r=>r.userId),[privateId,paused]);await assert.rejects(()=>f.service.route(viewer,'/api/avatars/urls',{ids:Array(25).fill(owner)}));f.tables.gym_preferences[1].body.avatarPhoto=ref(owner);result=await f.service.route(viewer,'/api/avatars/urls',{ids:[other]});assert.equal(result.urls.length,0);});
test('client photo references survive an in-flight stale refresh and are dropped on account changes',async()=>{const {configureAvatarPhotos,memberAvatar}=await import('../web/avatar-photos.js');configureAvatarPhotos(owner,{[owner]:photo},null);assert.match(memberAvatar(owner,'🐯'),new RegExp(photo));configureAvatarPhotos(owner,{},null,true);assert.match(memberAvatar(owner,'🐯'),new RegExp(photo));configureAvatarPhotos(other,{},null);assert.equal(memberAvatar(owner,'🐯'),'🐯');configureAvatarPhotos('',{},null);});
