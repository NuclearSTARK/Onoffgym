import {COACH_PERMISSIONS} from './permissions.js';
const groups=[
 ['수업',[['조회',['workouts.read']],['등록·수정·삭제',['workouts.create','workouts.update','workouts.delete']]]],
 ['회원 기록·사진',[['기록 입력·수정·삭제',['records.create','records.update','records.delete']],['사진 관리',['photos']]]],
 ['운동 영상·종목',[['콘텐츠 관리',['videos','rm']]]],
 ['공지·알림',[['공지와 알림',['notices','banner','push']]]],
 ['운영 설정',[['수업 공개·TV',['release','tv']]]],
 ['ACC',[['조회',['acc.read']],['등록·수정·삭제',['acc.create','acc.update','acc.delete']]]]
];
const short={'workouts.read':'미공개 조회','workouts.create':'등록','workouts.update':'수정','workouts.delete':'삭제','records.create':'입력','records.update':'수정','records.delete':'삭제',photos:'사진 관리',videos:'운동 영상',rm:'1RM 종목',notices:'공지',banner:'배너',push:'푸시 알림',release:'공개 시각',tv:'TV 화면','acc.read':'미공개 조회','acc.create':'등록','acc.update':'수정','acc.delete':'삭제'};
export function coachPermissionsMarkup(member,{escape=String}={}){
 const allowed=new Set(member.coach_permissions||[]),e=escape;
 return `<section class="coach-permissions" ${member.role==='coach'?'':'hidden'}><h4>코치 세부 권한</h4><p class="field-hint">추가 관리 권한은 기본으로 꺼져 있어요. 필요한 기능만 허용해주세요. 회원·회원권·포인트 관리는 운영자 전용입니다.</p>${groups.map(([title,rows])=>`<fieldset class="coach-permission-group"><legend>${title}</legend>${rows.map(([,keys])=>`<div class="coach-permission-options">${keys.map(key=>`<label class="coach-permission-option"><span>${e(short[key])}</span><input type="checkbox" role="switch" name="coach_permissions" value="${key}" aria-label="${e(COACH_PERMISSIONS.find(x=>x[0]===key)[1])}" ${allowed.has(key)?'checked':''}></label>`).join('')}</div>`).join('')}</fieldset>`).join('')}</section>`;
}
