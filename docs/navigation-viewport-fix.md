# 탭바 위치 수정

원인 재현: 실제 화면 높이가 844px인데 `visualViewport.height`만 530px로 남으면 기존 코드가 탭바의 아래 끝을 530px로 직접 지정했다. 이때 키보드가 없는 화면에서도 탭바가 위로 떠 있었다.

탭바의 직접 `top` 계산과 관련 CSS 우선 적용을 제거하고 브라우저의 `position:fixed; bottom` 처리를 사용한다. 63px 높이, 가로 폭, 안전 영역 여백, 테마, 스프링·스와이프 및 스크롤 숨김 동작은 유지한다. 팝업은 계속 visual viewport를 따라 키보드 안쪽에 배치한다.

키보드를 닫은 뒤에도 작은 viewport 값 때문에 탭바가 계속 숨겨지는 경우를 막기 위해, 입력 포커스가 해제되면 기존 닫힘 애니메이션 대기 후 숨김 상태를 해제한다.

검증: 단위 테스트 234개와 Cloudflare Pages 빌드 통과. `python tests/browser/navigation-viewport.py`로 높이 불일치 양방향, 앱/뒤로가기 복귀, 키보드·팝업 닫힘, 탭 전환·여러 탭 스와이프, 스크롤 숨김/표시, 안전 영역, 회전 및 320~760px 화면의 4/5탭을 검증한다. 이 브라우저 테스트에는 Python Playwright와 Chromium이 필요하다. iOS의 지연된 viewport 값을 재현한 Chromium 테스트이며 실제 iPhone 기기 검증을 뜻하지 않는다.

2026-11-10 배포 릴리스에 포함했다. 운영 DB 변경은 없다. 배포된 정적 파일은 `ONOFF_QA_ORIGIN=https://onoffgym.pages.dev python tests/browser/navigation-viewport.py`로 동일하게 확인할 수 있다.
