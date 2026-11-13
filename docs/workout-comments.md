# 오늘의 운동 댓글

B/T·WOD 전체 운동 내용 아래에 동일한 `댓글` 영역을 표시합니다. 날짜와 수업(B/T 또는 WOD)으로 구분하며 S1·S2 구간이나 시간대별로 분리하지 않습니다. 공개된 내용이 있는 수업에 자동 표시되며 운영자가 별도 설정할 필요가 없습니다.

기본은 접힌 댓글 수 표시입니다. 제목으로 펼치거나 `댓글 쓰기`를 누르면 내용과 입력칸이 나타납니다. 프로필 사진/이모지, 이름, 한국시간, 수정 여부를 표시합니다. 댓글은 최대 500자이며 처음 20개를 불러오고 `이전 댓글 더 보기`로 이어서 조회합니다. 본인은 수정·삭제할 수 있고 운영자는 다른 댓글을 삭제할 수 있습니다. 운영자도 타인의 문구를 수정할 수는 없습니다.

새 테이블 `gym_workout_comments`는 수업과 작성자에 대한 FK, 페이지 조회 인덱스, 작성자 인덱스, RLS 및 service-role 전용 정책을 사용합니다. 수업이나 계정 삭제 시 해당 댓글도 삭제됩니다. RPC `onoff_workout_comments(uuid,jsonb)`는 SECURITY INVOKER이며 service_role만 실행합니다. Edge API는 검증된 로그인 ID만 actor로 전달합니다.

RPC에서 승인·삭제 대기 상태, 현재 회원권 접근, 공개 시각, 작성자의 공개 동의, 수정·삭제 권한을 검사합니다. 일반 회원에게는 공개 동의를 철회했거나 승인 상태가 아닌 다른 사람의 댓글을 반환하지 않습니다. 운영자는 관리 목적으로 조회·삭제할 수 있습니다. 생성 UUID는 중복 전송을 방지하며 수정/삭제 revision으로 동시 변경을 검출합니다. 페이지는 생성시각·UUID 커서를 사용합니다.

API: GET `/api/workout-comments?date=YYYY-MM-DD&program=B%2FT|WOD&action=summary|list`; POST `/api/workout-comments/create|update|delete`. 댓글 데이터는 로그인 부트스트랩에 추가하지 않고 해당 영역에서 별도로 읽습니다. 변경 시 기존 전역 revision으로 다른 화면의 갱신을 알립니다. 댓글 알림 발송 작업은 생성하지 않습니다.

검증: `npm test`, `npm run build:backend`, `npm run build:cloudflare`, `npm run build`, `python tests/browser/workout-comments.py`. `supabase/workout-comments-tests.sql`은 가상 계정과 수업으로 분리·수정·삭제·권한·동의·미공개 수업·회원권·마지막 회차·중복 생성·페이지 조회를 실제 DB에서 확인하고 전체 트랜잭션을 롤백합니다. 회원에게 알림을 보내거나 실제 회원 데이터를 변경하지 않습니다.
