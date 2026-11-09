# Cloudflare Pages 연결

상태: 저장소 빌드 준비 완료. Cloudflare 계정 연결과 실제 배포 주소 확인 전이며 서비스 이전은 완료되지 않았다. 기존 GitHub Pages와 Supabase는 유지한다.

## 계정에서 진행할 단계

1. https://dash.cloudflare.com/ 에 로그인한다.
2. Workers & Pages에서 애플리케이션 생성 → Pages → Git 저장소 연결을 선택한다. Workers 배포 화면이 아닌 Pages를 선택한다.
3. GitHub 계정 연결 시 `NuclearSTARK/Onoffgym` 저장소만 허용한다.
4. 다음 설정으로 배포한다.

| 항목 | 값 |
| --- | --- |
| 프로젝트 이름 | `onoffgym` (사용 중이면 사용 가능한 이름) |
| 프로덕션 브랜치 | `main` |
| 프레임워크 | `None` |
| 루트 디렉터리 | 저장소 루트 (비워 둠) |
| 빌드 명령 | `npm run build:cloudflare` |
| 빌드 출력 디렉터리 | `pages-dist` |
| 빌드 환경 변수 | `NODE_VERSION=24` |

Cloudflare에 Supabase 서비스 키, TV 암호, 회원 데이터 등 비밀 환경 변수를 넣지 않는다. 공개 프로젝트 설정은 기존 정적 빌드가 사용한다. `npm run build`는 예전 Worker/D1용이므로 이 Pages 연결에 사용하지 않는다.

## 새 주소가 생성된 후

초기 배포 화면이 열리는 것만으로 회원 사용 준비가 끝나지 않는다.

- 실제 Pages 주소 또는 최종 전용 도메인의 **정확한 origin**을 Supabase Edge Function의 CORS 허용 목록에 추가하고 재배포한다. `*.pages.dev` 전체 허용은 하지 않는다.
- Supabase Auth Redirect URLs에 새 주소의 `/auth-callback.html`을 추가한다. 기존 GitHub 복귀 주소도 유지한다. 최종 이전 시 Site URL도 맞춘다.
- 로그인·비밀번호 복구·TV 암호 진입·사진 표시·기존 경로 알림 링크의 리다이렉트를 확인한다. 실제 알림 발송이나 회원 기록 변경은 별도 실사용 검증 시에만 한다.
- TV 앱 등록 QR이 연결하는 네이버 단축 주소도 최종 주소로 변경해야 한다. 현재 QR은 기존 GitHub 주소로 연결된다.
- 기존 홈화면 설치 앱과 푸시 구독은 도메인 사이에 자동으로 이전되지 않는다. 회원에게 새 주소에서 홈화면 추가와 알림 허용을 다시 안내한다.
- 전용 도메인을 사용할 계획이면 회원에게 배포하기 전에 먼저 연결해 중복 재설치를 줄인다.

이 빌드는 보안 헤더와 기존 `/Onoffgym/` 링크의 임시 리다이렉트를 Cloudflare 전용 파일로 생성한다. 기존 GitHub Pages 빌드에는 이 파일들을 추가하지 않는다. Cloudflare 프런트엔드 연결이 Supabase API의 접근 제어를 대신하지는 않는다.

참고: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/ 및 https://developers.cloudflare.com/pages/configuration/headers/
