# ONOFF CROSSFIT

온오프짐 전용 반응형 회원 앱. 기본 운영 주소는 https://nuclearstark.github.io/Onoffgym/ 이며 GitHub Pages 프런트와 대표 소유 Supabase를 사용한다.

## 로그인과 회원 관리

이메일·비밀번호·실명으로 가입하고 운영자가 승인해야 회원 화면에 접근한다. 가입 이메일 인증은 생략한다. Supabase의 **Confirm email OFF** 설정이 확인되지 않으면 앱은 가입 요청을 보내지 않는다. 이메일 계정 소유가 인증된 것으로 간주해 권한을 부여하지 않는다. 첫 운영자는 계정 생성 후 실제 회원 UUID를 확인하여 명시적으로 지정한다. 누구나 먼저 가입해서 운영자가 되는 기능은 없다.

로그인은 Supabase SDK가 유지·갱신한다. 승인 대기는 자동 갱신되며, 계정별 상태와 역할은 매번 서버가 확인한다. 비밀번호 재설정은 이메일 링크 → `auth-callback.html` → 새 비밀번호 입력 순서다. URL 설정과 실제 SMTP 발송 연결이 필요하다. 회원 탈퇴는 현재 비밀번호 재확인, 전체 세션 해제, Auth 계정의 하드 삭제와 개인 데이터 cascade를 사용한다. 마지막 승인 운영자는 다른 승인 운영자를 지정하기 전에 탈퇴·권한 해제할 수 없다.

## 데이터와 알림

Supabase 운영 앱은 수업·회원·운동 기록·1RM·출석·회원권·게시판을 서버에 저장한다. `?preview=1#home`은 실제 서버와 분리된 브라우저 예시 앱이다. 기존 owner-private Sites 미리보기는 이전 D1 백엔드를 유지하며 Supabase와 데이터가 합쳐지지 않는다.

웹 푸시는 알림을 허용한 기기에 발송하며 매분 서버 큐를 처리한다. 회원 가입 시 pending 회원과 중복 없는 승인 요청을 함께 생성한다. 승인 요청은 승인 운영자 중 해당 알림을 켠 기기에만 보내고 실제 전송 전 역할·신청 상태를 다시 확인한다. 공지·운동 공개 알림, 운영자 문구 작성·자기 기기 시험·이력을 지원한다. 기기 잠금 화면 수신은 실기기 시험으로 별도 확인한다.

모든 공개 앱 데이터 API는 Supabase Auth로 사용자를 검증한다. 앱 테이블의 직접 브라우저 접근과 RPC 호출은 허용하지 않는다. 개인 이름·이메일·JWT의 사용자 수정 가능 metadata로 역할을 결정하지 않는다. 서비스 비밀 키는 서버에만 둔다.

## 수업과 화면

- 공개 시각은 한국 시간 기준 운영 설정(기본 전날 22:00)을 사용하고 서버가 비공개 운동을 걸러낸다.
- XLSX 양식·예시 다운로드, 업로드 검증·미리보기·덮어쓰기 확인, 동작별 유튜브 링크를 지원한다.
- 출석은 버튼으로 하루 한 번 처리하고 횟수권은 하루 1회 차감한다. GPS는 사용하지 않는다.
- 수요일은 WOD만 표시한다. 휴강일과 오픈짐만 있는 날은 홈 시간표를 숨기며 하단 메뉴는 고정한다.
- TV는 4자리 암호, 가로 기본·운영자가 선택한 세로 방향, 수업별 색상, 긴 내용 페이지 전환을 지원한다.

## 개발과 검증

- `npm test`: 검증·API 권한·회원권·푸시·계정 처리 테스트.
- `node --test --test-isolation=none tests/*.test.mjs`: 각 테스트 결과를 개별 표시.
- `node scripts/dev.mjs`: 로컬 D1 호환 SQLite 미리보기. 개발용 쿠키는 운영 코드에서 사용하지 않는다.
- `npm run build:backend`: `supabase/functions/onoff-api/index.ts` 생성.
- `npm run build:pages`: 공개 Supabase 설정을 넣은 `pages-dist/` 생성. 전체 JS/CSS 버전을 매긴다.
- `npm run build`: 기존 Sites Worker, 웹 자산·D1 마이그레이션을 `dist/`에 생성.
- `python scripts/make-template.py`: XLSX 양식·예시 생성(openpyxl 필요).

SQL 검증은 `supabase/tests.sql`, `supabase/push-tests.sql`, `supabase/email-tests.sql`이며 실제 서비스 역할·트리거·cascade를 검증한 뒤 모두 rollback한다. 브라우저 모의 테스트가 실제 메일 수신·회원의 기기 간 동기화·실제 TV 동작을 대신하지 않는다.

## 배포와 운영 문서

GitHub main push 시 검증 후 Pages에 배포한다. Sites 미리보기는 소스 커밋과 동일하게 빌드한 아카이브를 배포하고 기존 비공개 접근 범위를 유지한다. Supabase Edge 함수와 SQL 마이그레이션은 별도로 적용한다.

- [대표·운영자 인수인계](docs/운영자-인수인계.md)
- [Supabase 연결](docs/supabase-connection.md)
- [테스트 체크리스트](docs/handover-test-plan.md)

실제 메일 발송, 첫 운영자 지정, 개인정보 안내의 시행일·위탁·백업 보관 정책, 실제 휴대폰 수신은 설정/실기기 확인이 필요하다. 별도 순위 마감·집계 정책은 기존 체크리스트에 따른다.
