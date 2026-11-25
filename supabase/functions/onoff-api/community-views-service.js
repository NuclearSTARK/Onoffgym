import {membershipState} from '../../../web/membership.js';
import {kstDate} from '../../../web/core.js';
import {meetupLifecycle} from '../../../web/meetups.js';
const fail=(message,status)=>{throw Object.assign(Error(message),{status});};
export function createCommunityViewsService(db,{now=()=>new Date()}={}){
 async function result(query){const {data,error}=await query;if(error)fail(error.code==='42501'?'게시글을 읽을 권한이 없어요.':'조회수를 불러오지 못했어요.',error.code==='42501'?403:503);return data;}
 const one=(table,key,value)=>result(db.from(table).select('*').eq(key,value).maybeSingle());
 async function counts(member,postIds=[],noticeIds=[]){
  if(!postIds.length&&!noticeIds.length)return {};
  return await result(db.rpc('onoff_community_view_counts',{actor:member.id,post_ids:postIds,notice_ids:noticeIds}))||{};
 }
 async function read(member,{id,kind}){
  if(member.status!=='approved'||member.delete_requested_at)fail('승인된 회원만 이용할 수 있어요.',403);
  const item=await one(kind==='notice'?'gym_notices':'gym_posts','id',id);
  if(!item||meetupLifecycle(item,now()).expired)fail('게시글을 찾을 수 없어요.',404);
  if(member.role!=='admin'&&member.role!=='coach'){
   const pass=await one('gym_memberships','user_id',member.id),day=kstDate(now());
   const attended=pass?.kind==='visits'&&pass.remaining_visits===0?await result(db.from('gym_attendance').select('date').eq('user_id',member.id).eq('date',day).eq('membership_id',pass.id)):[];
   if(!membershipState(pass,day,attended.length>0).active)fail('회원권 이용 상태를 확인해주세요.',403);
  }
  if(kind==='post'&&member.role!=='admin'&&item.author_id!==member.id&&item.author_id){
   const author=await one('gym_members','id',item.author_id);
   if(author?.disclosure_consent===false)fail('게시글을 찾을 수 없어요.',404);
  }
  // The existing transaction locks the actor and records one first-read key.
  // Self views are excluded both here and in the aggregate SQL for old records.
  if(item.author_id!==member.id)await result(db.rpc('onoff_commit',{actor:member.id,op:'community-read',p:{id,kind}}));
  const values=await counts(member,kind==='post'?[id]:[],kind==='notice'?[id]:[]);
  return {ok:true,viewCount:values[kind+':'+id]||0};
 }
 return {counts,read};
}
