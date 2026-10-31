# GitHub 소유권 이전 준비

현재는 준비 단계다. 대표님 GitHub 아이디는 아직 없으며 실제 소유권이나 서비스 주소를 변경하지 않았다. Supabase는 이미 대표 소유이므로 프로젝트·회원 데이터를 그대로 사용한다. 앱 소유권 인수인계와 앱 안의 운영자 권한은 별개다.

## 이전 전 보관

- 변경을 main에 커밋·배포하고 해당 Git SHA, 성공한 Actions 실행 주소를 기록한다.
- `git archive --format=zip --output=onoff-source.zip HEAD`로 전체 소스를 백업한다. `.github` 디렉터리도 반드시 포함한다. ZIP은 소스 백업이며 서버 DB 백업은 아니다.
- 변경 이력까지 별도 보관하려면 `git bundle create onoff-history.bundle --all`을 사용한다. 별도 암호·서비스 키·SMTP 비밀값은 저장소나 ZIP에 넣지 않는다.
- 대표가 Supabase에 접속하고 두 번째 앱 운영자 계정도 사용할 수 있는지 확인한다. 대표 이메일 `goffo@naver.com`은 현재 계정 생성 전이므로 가입 후 실제 계정을 확인해 운영자로 지정해야 한다. 이메일 일치만으로 자동 권한을 부여하지 않는다.

## 대표 계정이 생기면

1. 대표가 GitHub 계정을 만들고 아이디를 알려준다. 저장소 이름은 `Onoffgym`을 유지하는 편이 변경 범위가 적다.
2. `npm run handover:plan -- --owner 대표아이디`를 실행해 새 주소와 바꿀 항목을 확인한다. 이 명령은 검사·계획 출력만 하며 파일·서버·저장소 설정을 변경하지 않는다.
3. 현재 저장소 Settings → General → Danger Zone → Transfer ownership에서 대표에게 소유권을 이전하고 대표가 수락한다. 실제 이전은 사용자 지시 후 진행한다.
4. 새 저장소가 Public이고 Settings → Pages → Source가 GitHub Actions인지 확인한다. Actions 실행이 허용되어야 한다. GitHub 앱 연결에도 이전된 저장소 접근을 허용한다.
5. 새 main 배포가 성공하는지 확인한다. 기존 GitHub Pages 주소가 새 주소로 자동 이동한다고 가정하지 않는다.

## 새 주소에서 바꿀 설정

| 위치 | 변경 내용 |
|---|---|
| Supabase Authentication → URL Configuration | 새 Site URL과 `<새 사이트>/auth-callback.html` 등록. 전환 중 기존 주소를 잠시 유지할 때는 각각 허용하고 검증 후 오래된 주소 제거 |
| Edge API `server.js` | CORS의 허용 출처와 기본 응답 출처를 새 GitHub Pages origin으로 변경하고 API 재배포 |
| 회원용 앱의 고정 링크 | 로그인·탈퇴 안내 등 `nuclearstark.github.io` 링크를 새 주소로 변경 |
| 알림 링크 | 저장소 이름이 같으면 `/Onoffgym/` 경로 유지. 이름이 바뀌면 Edge·SQL 큐·기존 대기 알림 경로를 함께 점검 |
| 휴대폰 웹 푸시 | 새 출처에서 알림 허용과 구독 다시 연결. 이전 출처 구독을 자동으로 새 출처 구독으로 취급하지 않음 |
| 홈 화면 앱·TV | 새 주소로 홈 화면 앱 추가, TV 새 주소 접속 후 PIN 재입력. 기존 기기 로컬 설정은 자동 이전되지 않음 |
| Git remote | 개발 환경의 GitHub remote를 새 저장소 주소로 갱신 |

Supabase URL·공개 키·데이터는 같은 프로젝트를 사용하므로 변경하지 않는다. 비밀번호 재설정용 SMTP, 서비스 비밀 키와 서버 VAPID 설정도 Supabase에 남긴다. GitHub 이전을 위해 새 DB나 유료 서비스를 만들 필요는 없다.

기존 `.openai/hosting.json`의 Sites 프로젝트는 개발자 소유의 별도 비공개 D1 미리보기다. GitHub 소유권 이전이 이 프로젝트의 소유권까지 이전하는 것은 아니다. 대표의 실제 운영 경로는 GitHub Pages + 대표 Supabase다.

## 이전 완료 기준

- [ ] 새 주소에서 로그인·재접속 시 홈 자동 진입.
- [ ] 신규 가입·운영자 승인·권한 지정·다른 기기의 기록 동기화.
- [ ] 기존 수업·공지·회원권·개인 기록 유지.
- [ ] 비밀번호 재설정 메일 수신과 새 주소 복귀.
- [ ] 새 출처에서 공지·운영자 승인 요청·시험 푸시 수신 및 클릭.
- [ ] TV 암호 저장·진입·운동 공개 시각 자동 전환.
- [ ] 대표가 GitHub 배포·Supabase·발송 서비스에 접근 가능.
- [ ] 이전 주소 정리, 담당자·백업·장애 복구 방법 전달.
