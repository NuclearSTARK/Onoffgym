// Operator details supplied by the user; processing policies still need confirmation.
export const BUSINESS_DETAILS={
 name:'온오프짐',
 representative:'황은경',
 registrationNumber:'744-30-01163',
 address:'부산광역시 기장군 일광읍 화용길 157, 1층',
 phone:'010-6638-0826',
 email:'goffo@naver.com',
 privacyOfficer:'황은경 대표'
};

export const PRIVACY_DETAILS={operator:BUSINESS_DETAILS.name,officer:BUSINESS_DETAILS.privacyOfficer,contact:BUSINESS_DETAILS.phone+' / '+BUSINESS_DETAILS.email,retention:'회원 관리와 운동 기록 제공을 위해 이용 기간 동안 보관하며, 탈퇴 시 운영 DB의 계정·개인 기록을 삭제합니다. 법령상 별도 보관이 필요한 자료와 백업의 보관·삭제 주기는 운영 정책 확인 후 안내합니다.',providers:'Supabase: 이메일 로그인, 회원·운동 데이터 저장, 웹 푸시 예약 처리. 이메일 발송 제공자·처리위탁·국외 이전에 관한 세부 사항은 실제 설정을 확인해 반영합니다.',effectiveDate:'[운영자 확인 필요: 시행일]'};
const warning='<div class="privacy-draft"><strong>개인정보 안내 · 운영자 확인 필요</strong><p>실제 이메일 가입·회원 탈퇴 기능에 맞춘 안내입니다. 시행일, 처리위탁·국외 이전 및 백업 보관 기준은 운영자가 최종 확인해야 합니다. 예시 앱에는 실제 개인정보를 입력하지 마세요.</p></div>';
export function privacyLinks(){return '<div class="privacy-links"><button data-action="privacy-policy">개인정보처리방침</button><button data-action="privacy-rights">개인정보 문의·권리 안내</button></div>';}
export function privacyDocument(kind='policy'){
 const d=PRIVACY_DETAILS;
 if(kind==='withdrawal')return {title:'회원 탈퇴 안내',html:'<div class="privacy-document"><h3>탈퇴 시 처리</h3><p>현재 비밀번호를 확인한 뒤 로그인 계정과 개인 운동기록·1RM·출석·회원권 정보, 작성한 일반 게시글과 댓글을 삭제합니다. 웹 푸시 구독도 해제합니다. 운영 공지는 작성자 연결을 해제해 유지합니다.</p><p>앱 탈퇴와 체육관 회원권 해지·환불은 별개입니다. 마지막 운영자는 다른 승인된 운영자에게 권한을 넘긴 뒤 탈퇴할 수 있습니다.</p><button class="btn full" data-action="withdrawal">회원 탈퇴하기</button></div>'};
 if(kind==='rights')return {title:'개인정보 문의·권리 안내',html:'<div class="privacy-document"><h3>개인정보 담당자</h3><p>'+d.officer+'<br>'+d.contact+'</p><h3>열람·정정·삭제</h3><p>실명 정정은 운영자에게 요청해주세요. 개인정보 열람·정정·처리정지 관련 문의는 위 연락처로 접수할 수 있습니다. 계정 삭제는 개인설정의 회원 탈퇴에서 진행할 수 있습니다.</p><h3>비밀번호</h3><p>비밀번호는 운영자가 확인할 수 없습니다. 로그인 화면의 비밀번호 찾기에서 등록한 이메일로 재설정 링크를 요청해주세요.</p></div>'};
 return {title:'개인정보처리방침',html:warning+'<div class="privacy-document"><h3>1. 운영 주체와 담당자</h3><dl><dt>정식 상호</dt><dd>'+d.operator+'</dd><dt>대표자</dt><dd>'+BUSINESS_DETAILS.representative+'</dd><dt>사업자등록번호</dt><dd>'+BUSINESS_DETAILS.registrationNumber+'</dd><dt>주소</dt><dd>'+BUSINESS_DETAILS.address+'</dd><dt>개인정보 담당자</dt><dd>'+d.officer+'</dd><dt>문의</dt><dd>'+d.contact+'</dd></dl><h3>2. 수집 항목과 이용 목적</h3><p>이메일·비밀번호·실명을 받아 회원가입, 로그인, 운영자 승인과 계정 복구에 이용합니다. 비밀번호 인증은 Supabase Auth가 처리하며 앱 운영자에게 비밀번호 원문을 표시하지 않습니다. 가입 시 이메일 인증은 생략합니다.</p><p>운동기록·1RM·출석·회원권·휴회 정보, 게시글·댓글·참여 내역은 체육관 운영과 서비스 제공에 이용합니다. 개인정보 수집·이용 동의 시점과 안내 버전을 기록합니다.</p><h3>3. 회원 간 공개</h3><p>승인 회원에게 실명과 운동 결과가 공개됩니다. 순위 참여를 꺼도 운동 기록은 공개됩니다. 이메일·출석 상세·회원권·운영자 메모는 일반 회원에게 공개하지 않습니다.</p><h3>4. 웹 푸시</h3><p>알림을 허용한 기기의 구독 정보와 수신 설정, 발송 내역을 처리합니다. 기기별로 알림을 해제할 수 있습니다. 회원 승인 요청 알림은 운영자에게만 발송됩니다.</p><h3>5. 보관과 삭제</h3><p>'+d.retention+'</p><h3>6. 서비스 제공 업체</h3><p>'+d.providers+'</p><h3>7. 권리 행사</h3><p>열람·정정·삭제·처리정지는 '+d.contact+'로 문의할 수 있습니다. 개인설정의 회원 탈퇴 기능으로 계정을 삭제할 수 있습니다.</p><h3>8. 시행일</h3><p>'+d.effectiveDate+'</p></div>'};
}
