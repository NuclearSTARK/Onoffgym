# 온오프짐 Supabase 연결

## 적용 범위와 현재 상태

- 대표 소유 프로젝트: `onoffgym` / `gieomcjarupbnwwehqjc`, 서울 리전.
- 대시보드: https://supabase.com/dashboard/project/gieomcjarupbnwwehqjc
- GitHub Pages 앱은 Supabase Edge Function `onoff-api`에 연결한다. 수업, 공개 시각, 배너, 공지, 동작 영상, 회원 승인·권한·메모, 회원권, 출석, 운동 결과, 1RM, 개인 종목 선택, 커뮤니티 글·댓글·참여와 TV 설정을 저장한다.
- 카카오 로그인은 사용자 요청에 따라 아직 연결하지 않았다. 임시 이메일 로그인, 테스트용 실제 회원 계정, 첫 방문자 자동 운영자 승격은 만들지 않았다.
- 로그인하지 않은 회원 화면은 로그인 화면으로 돌아간다. `?preview=1#login`은 기존 브라우저 예시 앱이며 운영 DB를 호출하거나 예시 데이터를 복사하지 않는다.
- 별도 owner-private Sites 미리보기는 기존 D1 서버를 유지한다. 운영용 Supabase 데이터 경로는 GitHub Pages 앱이다. 기존 D1 데이터와 브라우저 예시 기록은 자동 이관하지 않았다.
- 웹 푸시 발송·예약, 실제 순위 집계, 탈퇴·카카오 연결 해제는 아직 별도 연결이 필요하다. 연결 전 기능은 사용할 수 없다고 표시한다.

## 접근과 저장

브라우저에는 공개용 publishable key만 들어간다. 회원 JWT는 Supabase Auth로 검증하고 매 요청마다 DB의 승인·권한을 확인한다. 사용자 metadata나 클라이언트가 보낸 이름·운영자 표시로 권한을 판단하지 않는다. 회원 이름 변경은 승인 전 본인 또는 운영자 정정으로 제한한다.

앱 테이블 18개는 모두 RLS를 켜고 일반 `anon`/`authenticated`의 직접 접근 권한을 제거했다. 검증된 서버 요청만 runtime의 service role을 통해 접근한다. 관련 RPC도 service role만 실행할 수 있다. service role key는 Supabase가 주입하는 서버 환경에서만 사용하며 저장소·브라우저·빌드 산출물에 넣지 않는다.

TV는 회원 JWT 대신 숫자 4자리 PIN과 별도 30일 난수 세션을 쓴다. PIN은 PBKDF2 해시로 저장하고, 세션도 DB에는 해시만 저장한다. IP별 5회/15분, 전체 50회/15분 상한을 DB에서 원자적으로 적용한다. 초기 공용 PIN은 없으며 운영자가 설정해야 한다. TV에는 서버가 선택한 한 날짜의 공개된 운동만 반환하고 회원·메모·기록은 반환하지 않는다.

횟수권은 한국 날짜 기준 하루 한 번만 차감하고, 재요청·취소 반복·회원권 교체 때 잘못 차감/복구하지 않도록 DB 트랜잭션과 잠금을 사용한다. 회원권 수정은 revision을 비교한다. 수업 덮어쓰기와 공개 시각 변경도 DB에서 처리해 이미 공개한 운동은 다시 숨기지 않는다.

변경 여부는 작은 revision 응답으로 확인한다. 변경이 없으면 전체 목록을 다시 내려받지 않는다. 첫 화면은 최근 30일 이후 수업과 선택 날짜, 개인 최근 기록 최대 1,000건, 선택 날짜의 회원 기록 최대 1,000건을 불러온다. 커뮤니티는 최근 200개 글, 댓글·참여는 최대 1,000개다. 장기 운영 전 기록·댓글 페이지 나누기를 확장한다. 이 상한은 삭제 기준이 아니며 DB 원본은 보존된다.

## 카카오 연결 때 마무리할 작업

1. 대표 소유 카카오 개발자 앱과 Supabase Auth의 Kakao provider 설정을 연결한다. 카카오 callback은 `https://gieomcjarupbnwwehqjc.supabase.co/auth/v1/callback`이다.
2. Supabase Auth의 사이트 URL과 허용된 로그인 복귀 주소를 `https://nuclearstark.github.io/Onoffgym/` 경로에 맞춘다. GitHub 소유권·주소 이전 후 다시 확인한다.
3. 현재 준비 중인 카카오 버튼을 `signInWithOAuth({provider:'kakao'})` 흐름으로 연결하고 실제 로그인·세션 유지·로그아웃을 확인한다. 브라우저 SDK는 PKCE와 프로젝트별 저장 키를 사용한다.
4. 대표가 실제 카카오로 가입한 후 `gym_members`에서 해당 Auth UUID를 확인해 그 계정만 운영자로 승인한다. 이름이나 가입 순서로 운영자를 자동 지정하지 않는다.
5. 실제 두 회원 계정과 운영자, 휴대폰·PC·TV로 승인 전 차단, 기기 간 공유, 회원권·출석, TV 색상 반영, 수업 공개 경계를 검증한다.
6. 개인정보 문서의 보관·삭제 기준, 시행일과 실제 외부 서비스 처리 내용을 확정한다.

## 재빌드와 배포

```bash
npm ci
npm run build:backend
npm run build:pages
node --test --test-isolation=none tests/*.test.mjs
```

- `supabase/functions/onoff-api/server.js`가 API 원본, `index.ts`는 공통 운동·회원권 검증을 포함한 생성 파일이다. Edge 배포 전 backend build를 실행한다.
- `supabase/config.toml`의 `verify_jwt=false`는 PIN으로 접속하는 TV 요청을 받기 위해 필요하다. 회원 요청은 함수 본문에서 반드시 Auth 검증을 한다.
- CORS 허용 주소는 API 원본의 `ORIGINS`에 있다. GitHub 이전으로 도메인이 바뀌면 함께 수정·재배포한다.
- 로컬 CLI는 이 실행 환경의 읽기 전용 홈 디렉터리 때문에 초기화하지 못했다. 마이그레이션은 연결 도구로 적용했고, 서버가 부여한 실제 version으로 `supabase/migrations`에 그대로 보관했다. 파일명을 임의로 만들지 않았다.
- `supabase/tests.sql`은 단일 트랜잭션 안에서 임시 Auth 데이터를 준비한 다음 실제 Edge 서버의 `service_role` 권한으로 가입 초기 처리와 DB 동작을 확인한 후 모두 rollback한다. 실사용자 로그인이나 실제 기기 간 테스트를 대신하지 않는다.

## 비용과 인수인계

조직의 현재 플랜이 `free`임을 조회로 확인했다. 새 프로젝트·유료 브랜치·유료 기능은 만들지 않았다. 무료 플랜에도 사용량과 비활성 프로젝트 정책이 있으므로 대표가 Supabase Usage와 공지된 한도를 확인해야 한다. 무료 한도 내 운영을 목표로 하되 무제한·영구 무료를 보장하지 않는다. 프로젝트 소유권은 대표 조직에 두고, 저장소 이전 후 API 코드·마이그레이션·허용 주소·Auth 복귀 주소·백업 절차를 함께 인계한다.
