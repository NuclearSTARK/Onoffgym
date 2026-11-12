# 프로필 사진 · 회원 현황 페이지

개인설정의 이름 옆 이모지 → 프로필 사진·이모지에서 사진을 선택합니다. 원형 미리보기에서 드래그·확대·좌우/상하 조절 후 저장합니다. 사진 삭제 또는 이모지 선택으로 이모지 표시로 돌아갑니다. 회원 목록·회원 관리 상세·운동 기록·일괄 기록 입력에 같은 사진을 표시합니다. 기간권 초록색·횟수권 주황색·휴회 노란색 테두리는 사진 위에 유지합니다.

사진은 선택 등록입니다. 회원 간 공개 동의를 확인하고, 승인된 본인 계정만 저장·삭제합니다. 프런트에서 512×512 JPEG, 최대 96KB로 압축하며 서버에서 크기·형식·정사각형 치수와 메타데이터 제거를 검증합니다. 외부 경로와 다른 회원 ID를 쓰기 요청에 받을 수 없습니다.

기존 비공개 `onoff-private-photos` 버킷의 `avatars/<회원 UUID>/<사진 UUID>.jpg` 경로를 사용합니다. `gym_preferences.body.avatarPhoto`에 참조를 보관하며 임의 클라이언트 설정으로 이 참조를 수정할 수 없습니다. 사진 URL은 로그인·승인·공개 동의 또는 운영자 권한을 재확인해 60초간 발급합니다. 조회 실패 시 이모지를 표시하며 사진 조회는 로그인 부트스트랩의 Storage 호출을 추가하지 않습니다.

`20261112052959_onoff_avatar_photo_cleanup.sql`은 사진 교체·삭제·이모지 전환·계정 삭제 시 기존 파일을 `gym_photo_cleanup`에 넣습니다. 기존 인증 요청/비공개 정기 작업의 `media.cleanup()`이 파일을 제거합니다. DB·버킷 공개 권한 변경은 없습니다.

출석·1RM·NAMED WOD 회원 현황 페이지에는 24px 가로 간격을 적용합니다. 공통 페이지 도구는 실제 페이지 시작점을 측정해 간격을 포함하며, 너비가 0인 숨겨진 화면에서는 계산하지 않습니다. 비정상·빈 초기 페이지도 보정하고 화면이 나타나거나 크기가 바뀌면 복구합니다.

검증: `npm test`, `npm run build:backend`, `npm run build:cloudflare`, `npm run build`, `tests/browser/avatar-photos.py`, `tests/browser/swipe-pages.py`, `tests/browser/member-overview.py`, `tests/browser/record-tools.py`. 브라우저 테스트의 계정·API·사진은 격리된 가상 데이터입니다.
