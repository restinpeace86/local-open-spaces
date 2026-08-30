# [개발 요청] 스팟픽 전국구 서버사이드 검색 구현 및 큐레이션(베스트 나들이 픽) 실제 DB 연동 마무리

## 구현 일시
2026-08-30

## 요구사항
1. 스팟픽(/nearby) 지도 검색을 지도 중심/반경 기반 클라이언트 필터에서 open_spaces
   전체를 대상으로 한 서버사이드 전국구 검색으로 전환. 검색 결과 클릭 시 지도
   panTo + 핀 활성화 연동.
2. 홈 화면 "베스트 나들이 픽"이 Mock 데이터 없이 100% curated_items/`/api/curated-items`
   로만 동작하는지 확인, is_active + 운영기간 필터 정확성 재검증, 관리자 등록→홈 노출
   흐름 최종 검증.

## 1. 스팟픽 전국구 서버사이드 검색

### 조치
- **`src/lib/home/get-home-feed.ts`**: `searchSpacesNationwide(keyword, limit=201)` 신규
  함수 추가. `searchEvents`와 동일한 토큰 단위(`splitSearchTokens`/`escapeIlikePattern`)
  다중 필드(`name`/`address`) ILIKE `.or()` 체이닝 패턴을 쓰되, 대상 테이블이 events가
  아닌 open_spaces이고 반환 타입이 SPACE 전용이라 별도 함수로 분리했다. 기존 비공개
  `SPACE_COLUMNS`/`toSpaceItem`/`SpaceRow`(getFreeFeed 등에서 이미 쓰이던 것)를 그대로
  재사용해 중복 없이 NearbyItem 셰이프로 매핑한다. `location_precision='EXACT'` 필터를
  `get_nearby_spaces_and_events` RPC와 동일하게 유지했다(Decision 009/017) — 좌표가
  부정확한 행을 지도에 찍으면 panTo가 엉뚱한 위치로 이동하게 되어 요구사항 취지에
  어긋난다. 검색어가 비어있으면(공백만 있어도) DB를 조회하지 않고 빈 배열을 반환한다.
- **`src/app/api/spots/search/route.ts`** (신규): `GET /api/spots/search?q=...` —
  `src/app/api/home/search/route.ts`(이벤트픽 GNB 검색, events 전용)와 동일한 얇은
  라우트 패턴. 그 파일 주석에 이미 "스팟픽의 open_spaces 검색과 분리된 별도
  엔드포인트"라고 예고해 둔 것을 실제로 만들었다.
- **`src/components/map/map-explorer.tsx`**: 검색어가 있으면(`isSearchMode`) 기존
  반경 기반 `items`(RPC 결과) 대신 `/api/spots/search`가 내려준 `searchResults`를
  기준으로 `filteredItems`/`visibleItems`를 구성하도록 바꿨다. 카테고리 필터는 두
  경우 모두 동일하게 그 위에서 한 번 더 적용된다(검색 결과 안에서도 중분류로 추가
  탐색 가능). 기존 클라이언트 사이드 name/address 토큰 매칭 로직은 완전히 제거했다
  (서버가 이미 매칭을 끝낸 결과라 중복 불필요). `SearchBar`가 이미 자체적으로 300ms
  debounce를 적용해 `keyword`를 넘겨주므로 별도 debounce 없이 `keyword` 변경에 바로
  반응하는 `useEffect`로 검색 API를 호출한다.
- **panTo + 핀 활성화**: 새 코드를 전혀 추가하지 않았다. `KakaoMapView`의
  `focusPosition` prop(이미 `selectedItem`에서 파생됨)과 `ItemListPanel`/`KakaoMapView`가
  공유하는 `onSelect`/`onSelectItem` → `setSelectedItem` 흐름이 이미 존재해서, 검색
  결과 목록의 항목을 클릭하면 (1) 지도가 그 좌표로 panTo하고 (2) `DetailModal`이
  열리는 두 동작이 기존 마커 클릭과 완전히 동일한 메커니즘으로 "그냥 작동"한다.
  검색 모드에서 `visibleItems`가 `KakaoMapView`의 `items` prop도 그대로 채우므로,
  검색 결과가 지도 위 마커로도 함께 렌더링된다(지도는 자동 fitBounds/zoom 로직이
  없어 화면 밖 마커가 있어도 기존 동작에 부작용이 없음을 확인).
- 로딩/에러/빈 상태 문구, "주변 N건" 바텀시트 라벨, 초과 안내 토스트 문구를 검색
  모드/반경 모드에 맞게 분기했다("주변"이라는 표현이 전국구 검색 결과에는 맞지 않음).

### 실측으로 발견한 추가 성능 함정과 조치
방금 구축된 pg_trgm GIN 인덱스가 있어도, "부산"처럼 흔한 2글자 지명은 141,980행
중 6,000건 이상과 매치된다. 여기에 `order('name')`을 걸면 매치된 행 전체를
정렬한 뒤에야 `limit`을 적용할 수 있어(정렬은 인덱스 스캔의 조기 종료를 막음)
1.9~5초가 걸렸고, **실제 라이브 서버로 재현한 결과 PostgREST의 8초
statement_timeout(2026-08-25-admin-data-grid-rpcs.sql에 이미 기록된 것과 동일한
제약)에 걸려 `"canceling statement due to statement timeout"`으로 실패하는 것을
직접 확인했다.** `order()`를 완전히 제거하자(검색 결과는 뷰포트 RPC의
`distance_meters` 같은 "관련도" 개념이 없어 이름순 정렬을 포기해도 손해가 없음)
같은 쿼리가 200~300ms로 떨어져 반복 실행해도 항상 1초 이내로 안정적으로 통과함을
확인했다. 코드/주석 모두에 이 근거를 남겨두었다.

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(71파일 720건 — `searchSpacesNationwide` 신규 5건,
  `map-explorer.test.tsx`의 기존 "검색 키워드 유연성" 3건을 신규 아키텍처에 맞는
  "전국구 서버사이드 검색" 3건으로 교체) 통과.
- `npm run build` 통과. `/api/spots/search`가 라우트 목록에 정상 등록됨을 확인.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- `GET /api/spots/search?q=용인 어린이상상`(사용자가 원 지시서에서 준 예시) →
  지도 중심(성남/분당)과 무관하게 "용인어린이상상의숲"(실제 좌표
  127.165.../37.249...)을 정확히 반환.
- `GET /api/spots/search?q=부산`(전국구 확인, 기본 지도 중심과 무관한 먼 지역) →
  order 제거 전에는 라이브 서버에서 타임아웃 재현, 제거 후 3회 반복 측정
  0.36~0.94초로 안정적으로 성공(정확히 201건, "초과 안내" 토스트 조건과 일치).
- `GET /api/spots/search?q=`(빈 검색어) → `{"items":[]}`, DB 조회 자체가 발생하지
  않음(코드 레벨에서 조기 반환) 확인.

## 2. 베스트 나들이 픽 Mock 데이터 제거 재확인 및 최종 검증

### 재확인 결과 — Mock 데이터 경로 없음(기존 구현이 이미 요구사항 충족)
- `src/components/home/best-pick-slider.tsx`: 순수 프레젠테이션 컴포넌트,
  `items: CuratedItem[]`를 prop으로만 받는다. 하드코딩된 샘플/폴백 배열 없음.
- `src/components/home/home-view.tsx`의 `useBestPicksFeed()`: `fetch('/api/curated-items')`
  결과만 사용하고, 실패 시(`.catch`) 이전 값 유지 또는 빈 배열로 대체할 뿐 가짜
  데이터를 만들어내지 않는다.
- `src/app/api/curated-items/route.ts`(공개 GET): `is_active=true` AND
  (`operation_start_date`가 NULL이거나 오늘 이하) AND (`operation_end_date`가
  NULL이거나 오늘 이상) — 요구사항 그대로 정확히 구현되어 있음을 코드 재확인.

### 최종 end-to-end 실측 검증(로컬 개발 서버, 프로덕션 DB, 테스트 데이터는 검증
직후 즉시 삭제)
1. `POST /api/admin/curated-items`(관리자 화면의 "[+ 신규 상품 등록]"이 실제로
   호출하는 것과 동일한 엔드포인트)로 테스트 상품 등록.
2. 등록 직후 `GET /api/curated-items`(홈 화면이 실제로 호출하는 바로 그 엔드포인트)
   응답에 새 상품이 즉시 포함됨을 확인 — 새로고침 시 홈 화면에 그대로 반영됨을
   의미한다(홈 화면은 클라이언트 컴포넌트에서 마운트 시 이 엔드포인트를 그대로
   호출하므로, 이 엔드포인트가 반환하는 것이 곧 화면에 렌더링되는 것과 동일하다 —
   이 세션에 브라우저 자동화 도구가 없어 실제 렌더링된 화면 스크린샷 확인은
   불가능함을 밝힌다, 대신 렌더링 로직 자체에 폴백/가짜 데이터 경로가 없음을 위
   코드 재확인으로 보강했다).
3. `PATCH /api/admin/curated-items`로 `is_active: false` 토글 → `GET
   /api/curated-items` 응답에서 즉시 사라짐을 확인(토글 즉시 반영 재검증).
4. 테스트로 만든 두 상품(정상 등록 1건 + 최초 쉘 인자 인코딩 문제로 제목이
   깨졌던 1건, 둘 다 curated_items에는 실존 확인) 모두 삭제해 원상 복구.

### 코드 변경 사항
없음 — Part 2는 기존 구현(2026-08-30 앞선 지시서에서 완성)이 요구사항을 이미
정확히 충족하고 있음을 재확인하는 검증 작업이었다.

## 특이 사항
1. Part 1 작업 중 curl로 관리자 API에 한글 payload를 직접 넣을 때 Windows Git
   Bash의 `-d` 인자 UTF-8 인코딩이 깨지는 현상을 발견했다(애플리케이션/DB 버그
   아님, 로컬 쉘 환경 문제) — 파일(`--data-binary @file.json`)로 우회해 정상
   확인했고, 깨진 테스트 행은 검증 후 삭제했다.
2. 검색 결과가 지도 마커로도 함께 렌더링되도록 했는데(리스트와 동일한
   `visibleItems`를 공유), 전국구 검색 특성상 화면 밖 먼 지역 마커가 많아질 수
   있다 — 다만 현재 `KakaoMapView`에 fitBounds/자동 줌 로직이 없어 시각적으로
   어색해지는 부작용은 없음을 확인했다. 만약 "검색 시 지도에 마커를 그리지 않고
   목록만 보여준다"는 다른 UX를 원하면 별도 지시로 조정 가능하다.
