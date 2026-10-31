import {createClient} from './assets/supabase-js-2.118.0.js';
const config=globalThis.ONOFF_BACKEND,status=document.querySelector('#callback-status');
try{
 if(!config?.url)throw Error('회원용 앱에서 재설정 링크를 다시 요청해주세요.');
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search),recovery=hash.get('type')==='recovery'||query.get('type')==='recovery';
 if(hash.get('error')||query.get('error'))throw Error('재설정 링크가 만료됐거나 이미 사용됐어요. 로그인 화면에서 새 링크를 요청해주세요.');
 if(!recovery)throw Error('비밀번호 재설정 링크를 확인해주세요.');
 const client=createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'onoff-auth-'+config.projectId}});
 const {data,error}=await client.auth.getSession();history.replaceState(null,'',location.pathname);
 if(error||!data.session)throw Error('재설정 링크가 만료됐어요. 새 링크를 요청해주세요.');
 sessionStorage.setItem('onoff-password-recovery',data.session.user.id);location.replace(new URL('./#login',location.href).href);
}catch(error){history.replaceState(null,'',location.pathname);status.textContent=error.message;}
