// Matches the member registration QR supplied by the gym.
export const TV_REGISTRATION_QR_URL='https://m.site.naver.com/2koh5';

const shareIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9H5v12h14V9h-3M12 15V2m-4 4 4-4 4 4"/></svg>';
const step=(number,content)=>`<li><span class="tv-install-number" aria-hidden="true">${number}</span><div>${content}</div></li>`;

export function tvRegistrationMarkup(){
 return `<section class="tv-registration" aria-label="ONOFF 앱 등록 안내">
  <div class="tv-registration-qr">
   <figure class="tv-registration-code"><img src="./assets/onoff-registration-qr.svg" width="560" height="560" alt="ONOFF 크로스핏 접속 QR 코드"></figure>
   <div class="tv-registration-copy"><span class="tv-registration-eyebrow">SCAN TO START</span><h1>ONOFF 앱 등록</h1><p>휴대폰 카메라로<br> QR 코드를 비춰주세요.</p><p class="tv-registration-approval">처음이라면 <strong>회원가입</strong><br>운영자 승인 후 이용해요.</p></div>
  </div>
  <div class="tv-registration-guide">
   <h2>홈 화면에 추가하고, 앱처럼 사용하세요</h2>
   <div class="tv-install-platforms">
    <section class="tv-install-platform tv-install-iphone" aria-labelledby="tv-install-iphone-title"><h3 id="tv-install-iphone-title">아이폰 <span>Safari</span></h3><ol>
     ${step(1,'<strong>Safari</strong>에서 ONOFF 열기')}
     ${step(2,`<strong class="tv-install-share">공유 ${shareIcon}</strong> →<br><strong>홈 화면에 추가</strong>`)}
     ${step(3,'오른쪽 위 <strong>추가</strong> →<br>홈 화면의 <strong>ONOFF</strong> 실행')}
    </ol></section>
    <section class="tv-install-platform tv-install-android" aria-labelledby="tv-install-android-title"><h3 id="tv-install-android-title">안드로이드 <span>Chrome</span></h3><ol>
     ${step(1,'<strong>Chrome</strong>에서 ONOFF 열기')}
     ${step(2,'오른쪽 위 <strong class="tv-install-dots">⋮</strong> →<br><strong>홈 화면에 추가 / 앱 설치</strong>')}
     ${step(3,'<strong>설치</strong> 또는 <strong>추가</strong> →<br>홈 화면의 <strong>ONOFF</strong> 실행')}
    </ol></section>
   </div>
   <section class="tv-install-notifications" aria-labelledby="tv-install-notifications-title"><h3 id="tv-install-notifications-title">알림도 함께 켜주세요</h3><p class="tv-install-notification-route">개인설정 → 알림 → <strong>알림 켜기</strong> → <strong>허용</strong></p><p>운영자 공지·운동 번개·내일 운동 공개 소식을 받아보세요.</p><p class="tv-install-notification-note">아이폰은 홈 화면에 추가한 ONOFF에서 설정하세요. (iOS 16.4 이상)<br>원하는 알림 항목을 켜고, 휴대폰에서도 알림을 허용해주세요.</p></section>
   <p class="tv-install-browser-note"><strong>카톡·네이버 안에서 열렸나요?</strong><br>메뉴에서 외부 브라우저로 열거나, 주소를 복사해 Safari·Chrome에서 여세요.<span>공유는 Safari 메뉴 안에 있을 수도 있어요. 기기별 메뉴 이름은 다를 수 있어요.</span></p>
  </div>
 </section>`;
}
