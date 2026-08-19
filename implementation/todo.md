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
  - **⏭️ 구현 스킵 (2026-08-20, awaiting-spec-confirmation):** 본 항목은 `spec/common/search.md`(2.3 카테고리/유형 필터만 정의) 및 `spec/space/space-card.md`, `spec/event/event-card.md`에 정의되지 않은 새 필터링 규칙(오늘 방문 가능/키즈/무료 공원·체험)과 카드 뱃지(주차 가능, 실내/야외, 예약상태)를 요구함. 이 뱃지들을 뒷받침할 `parking_available`/`indoor_outdoor`/연령대·태그 컬럼이 DB 스키마(`open_spaces`/`events`)와 RPC(`get_nearby_spaces_and_events`)에 존재하지 않으며, '아이와 방문 팁' 문구는 데이터 소스가 없어 하드코딩이 불가피함. CLAUDE.md 제3장 제4조(추측 금지), 제7장 제1조(Spec 없는 기능 추가 금지)·제3조(임의 비즈니스 로직 생성 금지)·제5장 제5조(하드코딩 최소화)와 상충되어 임의 구현하지 않음. 기획 AI의 spec/space, spec/event 문서 개정 및 데이터 스키마 확장 승인 후 재시도 필요.

- [ ] 주말 나들이용 광역 범위(10km/20km/30km/전체) 맞춤 알림 조건 설정 UI 및 알림함(LocalStorage) 구현
  - Header 알림 아이콘(🔔) 및 알림 설정 모달(광역 반경 10/20/30km/전체, 아이 연령대/태그, 예약 마감 D-1 임박 알림) 구현
  - `LocalStorage` 기반 `user_notification_settings` 및 생성된 알림 목록(`user_notifications`) 저장 구조 구축
  - 설정된 광역 반경 및 연령대 조건 기준 '예약 마감 임박 키즈 행사' 및 '내일/주말 방문 가능 장소' 알림 데이터 자동 추출 로직 작성
  - Playwright 실브라우저로 알림 설정 모달 동작, 광역 알림 조건 변경, 알림함 리스트 정상 노출 검증
  - **⏭️ 구현 스킵 (2026-08-20, awaiting-spec-confirmation):** `spec/` 디렉토리에 notification 관련 스펙 문서가 아직 존재하지 않음(CLAUDE.md 제5장 제1조가 `spec/notification`을 구현 대상 영역으로 명시하고 있으나 미작성 상태). `project/decision-log.md` Decision 003은 "맞춤 알림 구독"을 미승인 확장 기능의 예시로 명시하며 Feature Flag로 UI 노출을 차단할 것을 요구함. 또한 '연령대/태그' 조건 매칭과 'D-1 임박' 알림 자동 추출 로직은 현재 데이터 모델(연령대·태그 컬럼 부재)로는 구현 불가하여 임의 비즈니스 로직 생성이 필요함. CLAUDE.md 제3장 제2조(Spec 우선)·제4조(추측 금지), 제7장 제1조·제3조·제4조(미래 기능 구현 금지)와 상충되어 임의 구현하지 않음. 기획 AI의 spec/notification 문서 작성 및 승인 후 재시도 필요.
