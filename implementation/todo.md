- [x] 지도 이동 시 '이 위치에서 재검색' Floating 버튼 및 RPC 연동
  - 지도 드래그/패닝(`dragend`) 발생 시 화면 상단 중앙에 '이 위치에서 재검색 🔄' Floating 버튼 노출
  - 버튼 클릭 시 현재 지도의 중심 좌표(Center)를 새로운 기준점으로 지정하여 RPC(`get_nearby_spaces_and_events`) 재조회 및 반경 Circle 위치 갱신
  - Playwright 실브라우저로 지도 이동 후 재검색 버튼 노출, 클릭 시 마커/리스트 재조회 및 버튼 숨김 처리 동작 검증
  - **구현 완료 (2026-08-20):** `kakao-map-view.tsx`에 `dragend` 리스너 추가(`onDragEnd` prop), `map-explorer.tsx`에 `pendingRecenter`/`searchOverrideCenter` state로 버튼 노출·클릭 시 재조회 흐름 구현(`recenter-button.tsx` 신규). 패닝만으로는 자동 재조회하지 않아 spec/common/search.md 2.2 가드레일 준수. `npx tsc --noEmit`/`npm run test`/`npm run build` 모두 통과, `map-explorer.test.tsx`에 dragend→버튼 노출→클릭 시 새 좌표로 RPC 재호출 검증 테스트 추가. **Playwright는 리포지토리에 설치되어 있지 않고(e2e 인프라 부재) `chromium-cli` 등 브라우저 구동 도구도 이 실행 환경에 없어 실브라우저 자동 드래그 검증은 수행하지 못함** — 대신 dev 서버 기동 후 홈 라우트 200 응답 확인(런타임 크래시 없음)과 Vitest 통합 테스트로 대체 검증함. 실제 브라우저 드래그 UX 확인은 사람이 QA로 재확인 권장.

- [ ] '👶 아이와 함께 (주말/당일 쾌속 탐색)' 부모 맞춤형 Quick 필터 및 뱃지 강화
  - 지도/리스트 상단에 '오늘 방문 가능', '이번 주말 키즈', '무료 공원/체험' Quick Filter 칩 연동
  - 카드 UI 정면에 핵심 부모 체크포인트 뱃지(무료/유료, 주차 가능, 실내/야외, 예약상태) 최우선 노출
  - DetailModal 내에 '아이와 방문 팁' (유모차 접근성, 주변 공공 주차장 연동 링크) 안내 영역 추가
  - Playwright 실브라우저로 '오늘 방문 가능' 및 '키즈' 필터 선택 시 조건에 맞는 장소만 즉시 스크리닝되는지 검증

- [ ] 주말 나들이용 광역 범위(10km/20km/30km/전체) 맞춤 알림 조건 설정 UI 및 알림함(LocalStorage) 구현
  - Header 알림 아이콘(🔔) 및 알림 설정 모달(광역 반경 10/20/30km/전체, 아이 연령대/태그, 예약 마감 D-1 임박 알림) 구현
  - `LocalStorage` 기반 `user_notification_settings` 및 생성된 알림 목록(`user_notifications`) 저장 구조 구축
  - 설정된 광역 반경 및 연령대 조건 기준 '예약 마감 임박 키즈 행사' 및 '내일/주말 방문 가능 장소' 알림 데이터 자동 추출 로직 작성
  - Playwright 실브라우저로 알림 설정 모달 동작, 광역 알림 조건 변경, 알림함 리스트 정상 노출 검증
