import {membershipState} from './membership.js';
export function participationAccess({viewer,author,post,pass,today,attendedToday=false}){
 const deny=(code,message,action='')=>({allowed:false,code,message,action});
 if(viewer?.status!=='approved')return deny('approval_required','가입 승인 후 참여할 수 있어요.');
 if(!post)return deny('post_missing','삭제되었거나 확인할 수 없는 게시글이에요.');
 if(post.category==='자유글')return deny('not_joinable','이 게시글은 참여 신청을 받지 않아요.');
 if(viewer.disclosure_consent===false)return deny('sharing_required','참여자 이름 공개를 위해 개인설정에서 회원 간 공개 동의를 확인해주세요.','privacy-settings');
 if(!author||author.status!=='approved')return deny('author_unavailable','작성자 계정 상태를 확인하는 동안에는 새로 참여할 수 없어요.');
 if(author.disclosure_consent===false)return deny(author.privacy_version==='email-signup-v1'?'author_review':'post_private',author.privacy_version==='email-signup-v1'?'작성자가 새 개인정보 안내를 확인하면 참여할 수 있어요.':'작성자가 공개를 중단한 게시글에는 새로 참여할 수 없어요.');
 const access=membershipState(pass,today,attendedToday);
 if(viewer.role!=='admin'&&!access.active)return deny('membership_required',access.status==='paused'?'휴회 중에는 새로 참여할 수 없어요. 기존 참여는 취소할 수 있습니다.':access.status==='scheduled'?'회원권 이용 시작일부터 참여할 수 있어요.':'회원권 기간 또는 남은 횟수를 운영자에게 확인해주세요.');
 return {allowed:true,code:'allowed',message:'',action:''};
}
