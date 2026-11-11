import {normalizeDate} from '../../../web/core.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function createMemberOverviewService(db){return {async read(member,url){
 if(member.status!=='approved'||member.role!=='admin'||member.delete_requested_at)fail('운영자만 회원 현황을 볼 수 있어요.',403);
 const q=url.searchParams,kind=q.get('kind')||'attendance',action=q.get('action')||'summary',p={kind,action};
 if(!['attendance','rm','named'].includes(kind)||!['summary','history'].includes(action))fail('조회 종류를 확인해주세요.');
 for(const key of ['date','month'])if(q.has(key)){if(!normalizeDate(q.get(key)))fail('조회 날짜를 확인해주세요.');p[key]=normalizeDate(q.get(key));}
 const filter=q.get('filter')||'';if(filter.length>100)fail('종목을 확인해주세요.');p.filter=filter;
 if(action==='history'){const id=q.get('memberId'),page=q.get('page')||'0';if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')||!/^\d{1,6}$/.test(page)||+page>100000)fail('회원·페이지를 확인해주세요.');p.memberId=id;p.page=+page;}
 const {data,error}=await db.rpc('onoff_member_overview',{actor:member.id,p});
 if(error)fail(error.code==='42501'?'운영자만 회원 현황을 볼 수 있어요.':'회원 현황을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',error.code==='42501'?403:503);
 return data;
}};}
