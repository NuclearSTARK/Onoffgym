import {createClient} from './assets/supabase-js-2.118.0.js';
// backend-config.js is generated only for the public Pages deployment.
const config=globalThis.ONOFF_BACKEND;
export const connected=!!config?.url;
const preview=new URLSearchParams(location.search).get('preview')==='1';
if(connected)globalThis.ONOFF_DEMO=preview;
export const shared=connected&&!preview;
const notice=document.querySelector('#backend-notice');
if(notice&&(!shared||preview))notice.innerHTML='<strong>공개 테스트</strong><span>예시 데이터 · 입력은 이 브라우저에만 저장됩니다.</span><a href="./#login">회원 로그인</a>';
const client=shared?createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'onoff-auth-'+config.projectId}}):null;
let cache=null,cacheKey='',revision='';
export const resetBackendCache=()=>{cache=null;cacheKey='';revision='';};
export async function backendRequest(path,body){
 const {data:{session}}=await client.auth.getSession();
 const headers={apikey:config.publishableKey};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 const url=config.url+'/functions/v1/onoff-api'+path;
 const send=async (u,b)=>{const r=await fetch(u,{method:b?'POST':'GET',headers:{...headers,...(b?{'Content-Type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});let value;try{value=await r.json();}catch{throw Error('서버 응답을 확인할 수 없어요.');}if(!r.ok)throw Object.assign(Error(value.error||'연결을 확인해주세요.'),{status:r.status});return value;};
 if(!body&&path.startsWith('/api/bootstrap')){
  if(!session){resetBackendCache();return {viewer:null,workouts:{},members:[],library:[],serverNow:new Date().toISOString(),shared:true};}
  const key=session.user.id+path;
  if(cache&&cacheKey===key){const check=await send(config.url+'/functions/v1/onoff-api/api/revision');if(check.revision===revision)return {...cache,serverNow:check.serverNow};}
  const value=await send(url);cache=value;cacheKey=key;revision=value.revision;return value;
 }
 const value=await send(url,body);if(body)resetBackendCache();return value;
}
export async function backendTvRequest(path,body){
 const key='onoff-tv-session-'+config.projectId,token=localStorage.getItem(key),headers={apikey:config.publishableKey};
 if(token)headers['X-OnOff-TV-Token']=token;
 const r=await fetch(config.url+'/functions/v1/onoff-api'+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();
 if(!r.ok){if(r.status===401&&path!=='/api/tv/login')localStorage.removeItem(key);throw Object.assign(Error(data.error||'TV 연결을 확인해주세요.'),{status:r.status});}
 if(data.token)localStorage.setItem(key,data.token);if(path==='/api/tv/logout')localStorage.removeItem(key);return data;
}
export async function signOut(){if(client)await client.auth.signOut();resetBackendCache();location.href=location.pathname+'#login';location.reload();}
