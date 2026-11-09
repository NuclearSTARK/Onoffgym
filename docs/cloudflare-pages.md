# Cloudflare Pages 연결

프로덕션 Pages 주소: https://onoffgym.pages.dev/

상태: GitHub 연결 및 최초 정적 배포를 확인했다. API는 이 정확한 origin을 허용하며 기존 GitHub 주소도 유지한다. Supabase Auth URL 설정, 회원 로그인 실기기 확인, 기존 홈화면 설치·알림 재등록과 QR 전환은 별도로 확인해야 하므로 회원 대상 이전 완료를 뜻하지 않는다.

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
- Supabase Auth URL Configuration에서 Site URL은 `https://onoffgym.pages.dev/`, Redirect URLs에는 `https://onoffgym.pages.dev/auth-callback.html`을 추가한다. 기존 GitHub 복귀 주소도 유지한다. Pages는 `.html`을 생략한 경로로 리다이렉트하지만 앱이 Supabase에 요청하는 복귀 주소는 `.html` 주소다.
- 로그인·비밀번호 복구·TV 암호 진입·사진 표시·기존 경로 알림 링크의 리다이렉트를 확인한다. 실제 알림 발송이나 회원 기록 변경은 별도 실사용 검증 시에만 한다.
- TV 앱 등록 QR이 연결하는 네이버 단축 주소도 최종 주소로 변경해야 한다. 현재 QR은 기존 GitHub 주소로 연결된다.
- 기존 홈화면 설치 앱과 푸시 구독은 도메인 사이에 자동으로 이전되지 않는다. 회원에게 새 주소에서 홈화면 추가와 알림 허용을 다시 안내한다.
- 전용 도메인을 사용할 계획이면 회원에게 배포하기 전에 먼저 연결해 중복 재설치를 줄인다.

이 빌드는 보안 헤더와 기존 `/Onoffgym/` 링크의 임시 리다이렉트를 Cloudflare 전용 파일로 생성한다. 기존 GitHub Pages 빌드에는 이 파일들을 추가하지 않는다. Cloudflare 프런트엔드 연결이 Supabase API의 접근 제어를 대신하지는 않는다.

참고: https://developers.cloudflare.com/pages/framework-guides/deploy-anything/ 및 https://developers.cloudflare.com/pages/configuration/headers/

## 연결 검증 (2026-11-09)

- Supabase `onoff-api` v32 배포. 직전 v31 번들과 비교해 변경이 Cloudflare origin 하나 추가뿐임을 확인했다. JWT 검증 방식과 회원 권한 처리는 변경하지 않았다.
- 실제 Cloudflare origin의 health 요청 200, preflight 204, 비로그인 회원·TV 데이터 요청 401. 기존 GitHub health 200, 임의의 다른 Pages origin은 403.
- Chromium 모바일 viewport에서 실제 Pages 로그인·TV 진입 화면 200, 페이지 자바스크립트 오류 0건. 브라우저 자체의 교차 출처 API 요청도 확인했다.
- 보안 헤더 적용 및 기존 `/Onoffgym/` 링크의 쿼리 보존 리다이렉트 확인.
- 단위 테스트 228개 통과. 실제 회원 자격 증명 입력, 회원 데이터 변경, 알림·메일 발송은 하지 않았다. Supabase Auth URL 설정 및 실제 계정 로그인·기기 푸시 수신 완료를 뜻하지 않는다.
