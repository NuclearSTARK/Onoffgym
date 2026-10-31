export function authMessage(error){const message=String(error?.message||'');if(/invalid login credentials/i.test(message))return '이메일과 비밀번호를 확인해주세요.';if(/email not confirmed/i.test(message))return '가입 인증 설정을 확인 중입니다. 운영자에게 문의해주세요.';if(/already registered|already been registered/i.test(message))return '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해주세요.';if(/rate limit|too many requests/i.test(message))return '요청이 많아요. 잠시 뒤 다시 시도해주세요.';if(/same password/i.test(message))return '이전과 다른 비밀번호를 입력해주세요.';if(/password/i.test(message)&&/weak|least|short/i.test(message))return '비밀번호는 8자 이상으로 입력해주세요.';if(/email address.*invalid|invalid email/i.test(message))return '사용 가능한 이메일 주소를 입력해주세요.';if(/smtp|email.*send|sending.*email/i.test(message))return '메일을 보내지 못했어요. 잠시 후 다시 시도하거나 운영자에게 문의해주세요.';return '요청을 완료하지 못했어요. 입력 내용과 네트워크를 확인해주세요.';}
export function createEmailAuth(client,{callbackUrl,checkRegistration=async()=>true}={}){
 const requireClient=()=>{if(!client)throw Error('실제 회원용 앱에서 이용해주세요.');return client.auth;};
 const unwrap=async p=>{const {data,error}=await p;if(error)throw Error(authMessage(error));return data;};
 const email=v=>String(v||'').trim().toLowerCase();
 const password=v=>{if(typeof v!=='string'||v.length<8||v.length>128)throw Error('비밀번호는 8~128자로 입력해주세요.');return v;};
 return {
  async signIn(address,secret){return unwrap(requireClient().signInWithPassword({email:email(address),password:secret}));},
  async signUp(address,secret,name){name=String(name||'').trim();if(name.length<2||name.length>30)throw Error('실명은 2~30자로 입력해주세요.');password(secret);if(!await checkRegistration())throw Error('가입 인증 설정을 확인 중입니다. 운영자에게 문의해주세요.');const data=await unwrap(requireClient().signUp({email:email(address),password:password(secret),options:{data:{full_name:name,privacy_consent:true}}}));if(!data.session)throw Error('가입 인증 설정을 확인 중입니다. 운영자에게 문의해주세요.');return data;},
  async requestReset(address){return unwrap(requireClient().resetPasswordForEmail(email(address),{redirectTo:callbackUrl}));},
  async updatePassword(secret){return unwrap(requireClient().updateUser({password:password(secret)}));},
  async session(){return (await unwrap(requireClient().getSession())).session;},
  async signOut(){return unwrap(requireClient().signOut({scope:'local'}));}
 };
}
