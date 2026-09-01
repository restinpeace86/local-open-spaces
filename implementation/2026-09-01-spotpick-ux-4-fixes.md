# [개발 요청] 스팟픽(SpotPick) UI/UX 개선 및 버그 패치 (4가지 항목)

## 구현 일시
2026-09-01

## 1. 지도 마커 인터랙션 2단계 UX 개편

`map-explorer.tsx`에 `previewItem` 상태를 신설했다. 기존에는 마커 클릭 →
`handleSelectItem`(리스트 클릭과 동일 핸들러) → `selectedItem` 세팅 → 곧바로 전체
`DetailModal`이 열렸다. 이제 마커 클릭은 전용 핸들러(`handleMarkerSelectItem`)로
분리해 `previewItem`만 세팅하고, 신규 `MarkerPreviewCard`(썸네일 자리/장소명/간단
주소를 담은 말풍선형 바텀 카드)를 먼저 띄운다. 이 카드를 터치해야만
(`handleOpenDetailFromPreview`) `selectedItem`으로 승격되어 전체 상세 모달이 열린다.
카드의 ✕ 버튼으로는 아무것도 열지 않고 미리보기만 닫는다.

리스트 패널/AI 추천 바텀시트/겹친 마커 그룹 모달의 클릭은 요구사항이 "마커 클릭"으로
한정했으므로 기존처럼 전체 상세로 즉시 진입하도록 그대로 뒀다(이미 목록에서 한 번
고르고 들어오는 명시적 선택이라 2단계가 필요 없다고 판단) — 다만 두 경로가 동시에
남아있지 않도록 `handleSelectItem`/`handleSelectFromGroup`이 열리는 순간 `previewItem`을
함께 정리한다. `focusPosition`(지도 panTo 대상)은 `selectedItem ?? previewItem` 순으로
파생해, 1단계(마커 클릭)만으로도 지도가 해당 위치로 이동하는 요구사항을 만족한다.

위로 스와이프해서 여는 제스처까지는 이번 MVP에서 구현하지 않았다 — 탭으로 동일한
결과(2단계 진입)에 도달할 수 있어 요구사항의 "터치 또는 스와이프" 중 터치 경로만
우선 구현했다(구현 기록 특이 사항 참고).

## 2. [예약하기] 버튼 노출 조건 엄격화

`DetailModal.tsx`의 `secondaryAction`(스팟 전용 보조 액션)에 4번째 분기를 추가했다.
기존에는 공식 링크(`info_url`)/네이버 예약 링크(`naver_booking_url`)가 모두 없으면
무조건 자체 간편 예약 폼을 띄웠는데, 이제는 그 사이에 "spot_curations 큐레이션이
실제로 존재하는가"를 확인한다 — 스키마에 "예약 가능 여부"를 나타내는 별도 플래그가
없어(실측 확인) 새 컬럼을 만드는 대신, `spot_curations`가 존재한다는 사실 자체를
"관리자가 이 스팟을 확인하고 문의를 받을 준비가 됐다"는 실제 신호로 재해석했다
(제3장 제5조 추측 금지 — 근거 없는 컬럼을 새로 만들지 않음). 최종 순서:
`info_url` → `naver_booking_url` → 큐레이션 존재(자체 신청 폼) → **안내 텍스트**(무료
시설은 "예약 필요 없음 · 상시 무료 입장", 그 외는 "예약 관련 정보가 없습니다").
아무 신호도 없는 절대다수의 미확인 공공데이터 스팟은 이제 버튼이 아니라 텍스트만
보여준다.

## 3. 관리자 '스팟 큐레이션' 탭 장소 검색 자동완성

- `searchSpacesNationwide`(`get-home-feed.ts`)에 선택적 `categoryMin` 파라미터를
  추가하고, `/api/spots/search`가 `category_min` 쿼리 파라미터를 그대로 전달하도록
  확장했다. **실측 중 발견한 기존 버그**: `SPACE_COLUMNS`/`SpaceRow`/`toSpaceItem`에
  `category_min`이 애초에 빠져 있어(그 결과 이 검색 API 결과의 `category_min`이 항상
  undefined였다) `/nearby`의 검색 모드 중분류 필터가 검색 결과에 대해서는 한 번도
  매치될 수 없었던 잠재 결함이었다 — 이번에 추가하면서 함께 고쳤다(다른 소비처인
  getFreeFeed 등은 순수 추가 필드라 영향 없음).
- `spot-curations-panel.tsx`의 스팟 검색을 "키즈친화 식당"(category_min='놀이방식당',
  `CORE_SPOT_CATEGORIES`에서 조회 — 하드코딩 금지)으로 좁히고, 2글자 미만은 조회하지
  않도록 했다.
- 검색 결과 표시를 "[장소명 + 주소(동/읍/면)]"로 바꿨다 — 주소 끝의 "(OOO동)" 괄호
  표기를 뽑아 짧게 보여주고, 그런 표기가 없는 주소는 앞 3토큰(시/도+시/군/구)만
  간략히 보여준다(완벽한 파싱 근거가 없는 경우 추측하지 않고 안전하게 축약).

## 4. 스팟픽 상세 모달 내 중복 지도 뷰 제거

`DetailModal`에 `hideMapSection?: boolean`(기본 false) prop을 추가했다.
`map-explorer.tsx`(/nearby, 배경이 이미 지도)에서 여는 인스턴스에만 `true`로 넘긴다 —
홈/캘린더/지역별 그리드 등 배경이 지도가 아닌 다른 화면들은 기존처럼 인앱 미니맵이
유일한 위치 확인 수단이라 영향받지 않는다. `hideMapSection && !isEvent &&
hasExactLocation`일 때만 미니맵/"🔍 크게보기"/"🗺️ 지도에서 보기" CTA를 전부 생략한다 —
좌표가 애초에 부정확해 지도 대신 안내 문구만 뜨던 경우는 이 조건과 무관하게 그대로
보여준다(배경 지도와 중복되는 정보가 아니라 "왜 부정확한지" 설명하는 유용한 정보라
제거 대상이 아니라고 판단). 이벤트는 `hideMapSection`과 무관하게 항상 기존 구조를
유지한다(요구사항 "이벤트픽은 기존 리스트형 상세 구조 유지").

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(73파일 757건 — `spot-curations-panel.test.tsx` 신규 5건(자동완성),
  `map-explorer.test.tsx` 신규 4건(마커 2단계 UX), `detail-modal.test.tsx`에 예약
  버튼 조건 재구성 4건 + hideMapSection 4건 추가/갱신) 통과.
- `npm run build` 통과. 라우트 변경 없음(기존 API 확장만).

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- `GET /api/spots/search?q=키즈`로 실제 category_min 필드가 정상적으로 채워짐을
  확인(버그 수정 검증) — 예: "타요키즈카페" → `category_min: '키즈카페'`.
- `GET /api/spots/search?q=키즈&category_min=놀이방식당`으로 65건이 전부
  `category_min: '놀이방식당'`인 것만 반환됨을 확인(카테고리 필터 정상 동작).
- Playwright로 실제 관리자 화면에서 "키즈" 2글자 입력 → 실제 DB 검색 결과 10건이
  드롭다운에 표시되고, 첫 결과가 "플레이버디 키즈카페" + 짧은 주소 "가능동"으로
  정확히 축약 표시됨을 확인.

## 특이 사항
- 항목 1의 "위로 스와이프" 제스처는 구현하지 않았다 — 실제 드래그 물리 연산을
  안정적으로 구현하려면 추가 검증이 필요해 이번 범위에서는 탭(터치) 경로만
  제공했다. 필요하시면 별도 지시로 스와이프 제스처를 추가할 수 있다.
- 항목 1/4는 실제 Kakao Maps SDK 렌더링에 의존해 이 세션의 헤드리스 브라우저
  검증(위치 온보딩 모달이 계속 검색 입력을 가리는 이전부터의 한계)으로는 전체 흐름을
  끝까지 확인하지 못했다 — 대신 React Testing Library로 마커 클릭 이벤트를 직접
  시뮬레이션해 상태 전이(미리보기 → 전체 상세) 로직 자체를 정확히 검증했다(map-
  explorer.test.tsx 신규 4건, detail-modal.test.tsx hideMapSection 4건).
