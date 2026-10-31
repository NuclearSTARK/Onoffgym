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
export const PRIVACY_DETAILS={operator:BUSINESS_DETAILS.name,officer:BUSINESS_DETAILS.privacyOfficer,contact:BUSINESS_DETAILS.phone+' / '+BUSINESS_DETAILS.email,retention:'[확인 필요: 항목별 보관 기간과 파기 시점]',providers:'[확인 필요: 카카오·Supabase 실제 이용 항목, 위탁 및 국외 이전 사항]',effectiveDate:'[확인 필요: 시행일]'};
const warning='<div class="privacy-draft"><strong>개인정보 안내 초안</strong><p>운영자 정보를 반영했으며, 실제 가입 전 보관·삭제 기준과 서비스 연동 내용을 확정할 예정입니다. 현재 카카오 가입·회원 탈퇴는 연결되지 않았으며, 공개 테스트에는 실제 개인정보를 입력하지 마세요.</p></div>';
export function privacyLinks(){return '<div class="privacy-links"><button data-action="privacy-policy">개인정보처리방침 · 초안</button><button data-action="privacy-rights">개인정보 문의·권리 안내</button></div>';}
export function privacyDocument(kind='policy'){
 const d=PRIVACY_DETAILS;
 if(kind==='withdrawal')return {title:'회원 탈퇴 안내 · 초안',html:warning+'<div class="privacy-document"><h3>탈퇴 시 처리할 내용</h3><p>카카오와 온오프의 연결을 해제하고 로그인 접근을 차단합니다. 계정·운동기록·출석 등 개인정보는 확정된 보관·삭제 기준에 따라 처리합니다. 카카오 계정 자체는 삭제되지 않습니다.</p><h3>남은 회원권</h3><p>앱 탈퇴와 체육관 회원권 해지·환불은 별개입니다. 남은 회원권과 환불 절차를 체육관에 먼저 확인해주세요.</p><h3>보관·삭제 기준</h3><p>'+d.retention+'</p><p>법령에 따른 보관 의무가 있는 자료는 해당 근거와 기간을 명시하고 분리 보관합니다.</p><button class="btn full" disabled>실제 탈퇴 기능 · 카카오·DB 연결 후 제공</button><p class="field-hint">이 화면에서는 탈퇴 요청이나 정보 삭제가 실행되지 않습니다.</p></div>'};
 if(kind==='rights')return {title:'개인정보 문의·권리 안내',html:warning+'<div class="privacy-document"><p>본인 개인정보의 열람·정정·삭제·처리정지와 동의 철회를 요청할 수 있습니다. 법령에 따른 제한이 있는 경우에는 그 사유를 안내합니다.</p><dl><dt>운영 주체</dt><dd>'+d.operator+'</dd><dt>개인정보 담당자</dt><dd>'+d.officer+'</dd><dt>요청·문의 창구</dt><dd>'+d.contact+'</dd></dl><p>요청 접수 → 필요한 범위의 본인 확인 → 처리 및 결과 안내 순서로 운영할 예정입니다. 운영 시작 전에 요청 처리 절차와 실제 탈퇴·삭제 기능을 연결하고 검증합니다.</p><button class="btn soft" data-action="withdrawal">회원 탈퇴 안내 보기</button></div>'};
 return {title:'개인정보처리방침 · 초안',html:warning+'<div class="privacy-document"><h3>1. 운영 주체와 담당자</h3><dl><dt>정식 상호</dt><dd>'+d.operator+'</dd><dt>대표자</dt><dd>'+BUSINESS_DETAILS.representative+'</dd><dt>사업자등록번호</dt><dd>'+BUSINESS_DETAILS.registrationNumber+'</dd><dt>사업장 주소</dt><dd>'+BUSINESS_DETAILS.address+'</dd><dt>개인정보 담당자</dt><dd>'+d.officer+'</dd><dt>문의 전화번호</dt><dd>'+BUSINESS_DETAILS.phone+'</dd><dt>문의 이메일</dt><dd>'+BUSINESS_DETAILS.email+'</dd></dl><h3>2. 처리 목적과 정보</h3><p>회원 식별·가입 승인·서비스 접근 관리를 위해 카카오 식별정보, 실명, 승인 상태와 권한을 처리할 예정입니다. 출석·회원권 관리를 위한 출석일, 회원권 종류·기간·잔여횟수·휴회 이력과 운영자 구분 메모, 운동 기록 관리를 위한 날짜·운동·중량·시간·횟수·1RM·작성 내용 등을 실제 기능에 필요한 범위로 정합니다.</p><p>푸시 알림을 켠 기기의 구독정보와 필요한 서비스 접속·보안 기록 등 실제 수집 항목, 필수·선택 구분과 처리 근거는 연동 완료 후 확정합니다.</p><h3>3. 회원 간 기록 공개</h3><p>승인된 회원에게 이름과 운동기록이 공개되는 구조입니다. 순위 참여를 꺼도 기록은 공개되며, 등수 계산에서만 제외됩니다. 운영자 구분 메모는 일반 회원에게 공개하지 않습니다. 공개 대상·범위와 필요한 동의 절차는 실제 가입 전에 확정합니다.</p><h3>4. 보유 기간과 파기</h3><p>'+d.retention+'</p><p>목적 달성이나 보관 기간 종료 시 복구할 수 없는 방법으로 파기합니다. 법령상 보관 자료가 있다면 근거·항목·기간과 분리 보관 방법을 명시합니다.</p><h3>5. 외부 서비스·제3자 제공·위탁·국외 이전</h3><p>'+d.providers+'</p><p>실제 데이터 흐름에 따라 수탁자·업무, 제공받는 자·목적·항목·기간, 이전 국가·받는 자·시기·방법·거부 절차 등 해당 사항을 확정하고 필요한 고지·동의를 마련합니다.</p><h3>6. 정보주체의 권리</h3><p>본인 정보의 열람·정정·삭제·처리정지, 동의 철회와 탈퇴에 관한 요청 창구와 처리 절차를 제공합니다.</p><button class="link" data-action="privacy-rights">개인정보 문의·권리 안내 →</button><h3>7. 안전성 확보와 자동 수집</h3><p>운영자 권한 제한, 회원 승인 및 접근 관리, 안전한 통신과 보관·삭제 절차를 적용합니다. 실제 적용 조치와 쿠키·브라우저 저장소 등 자동 수집 수단 및 거부 방법은 연동 후 확정합니다. 공개 테스트의 예시 데이터는 현재 브라우저 저장소를 사용합니다.</p><h3>8. 시행 및 변경</h3><p>시행일: '+d.effectiveDate+'</p><p>실제 운영 정보가 반영되기 전까지 이 문서는 확정된 운영 방침이 아닙니다.</p></div>'};
}
