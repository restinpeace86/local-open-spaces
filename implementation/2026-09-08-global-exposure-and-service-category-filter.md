# 스팟픽 지도 반경 컷오프 폐지 + 노출 중분류(service_categories) 기준 카테고리 필터 전면 전환

## 구현 대상
사용자 지시(이전 스킵에 대한 재확인 후 명시적 재지시): "반경 컷오프 완전
폐지 + 도 전역 노출로 해줘(지도에 찍히는 거 기준) 다만 지도 scale에 따라
그룹핑하는거는 기존과 동일하게 하고.. 그리고 지도 말고 바텀시트에 보이는
것중에는 반경 컷오프로 현재 위치설정 기준 반경 5km 혹은 10km 내 20km
내에 거리순으로 보이도록 해줘.. 이걸 거리 눌러서 적용할수있게하고.. 현재
노출 중분류 기준으로 카테고리 필터 전면교체할것.. 지금 관리자화면에서
데이터들에 대하여 노출 중분류 기준으로 매핑중임.. 추후에 대부분 필요한
데이터 매핑하더라도. 현재 기준 약 20% 데이터만 남지 않을까 싶음"

사용자가 서술한 목표 흐름:
1. 대분류 클릭 → 하단 바텀시트에 중분류들 노출
2. 중분류 클릭 → 동일한 바텀시트쪽에 거리별 가까운 순서대로(기준 반경
   설정한 것에 대하여) 거리순으로 보여줌
3. 지도는 중분류 항목에 대하여 해당 데이터들 전역 노출, 다만 지도
   스케일에 따른 그룹핑은 현재와 동일

## 구현 일시
2026-09-08

## Decision
`project/decision-log.md` Decision 022로 기록. 이전에 같은 날 스킵(보류)
했던 두 항목(반경 컷오프 폐지 — spec 충돌, 노출 중분류 전면 전환 — 데이터
정합성 문제)을 사용자가 트레이드오프를 직접 확인한 뒤 재승인한 것이라
"임의 판단"이 아니라 명시적 의사결정이다. `spec/map/spatial-search.md`
§2.1/§3.1을 이 Decision에 맞춰 개정했다.

## 배경 조사
- `service_categories` 실측: 4개 대분류(키즈/놀이시설, 농장/체험, 자연/공원,
  문화시설) × 14개 중분류. `SPOT_MAJOR_CATEGORY_OPTIONS`(기존 category_min
  기반 대분류 상수)의 라벨/이모지/순서가 이 4개 대분류 이름과 정확히
  일치해(시드 데이터가 애초에 같은 이름을 썼음) 새 이모지 매핑 없이 문자열
  라벨로 매칭해 재사용했다.
- `open_spaces.service_category_id` 매핑 건수: 총 3,982건, 중분류별 최대
  2,304건("키즈카페 / 실내놀이터") — 표준 중분류(category_min) 최대
  57,692건("어린이놀이터")보다 훨씬 적어, 반경 컷오프를 없애도 기존
  §3.1의 "1,000개 초과 시 최상위 1,000개만 렌더링" 정책이 그대로 안전하게
  작동함을 확인했다.
- `open_spaces`는 RLS가 꺼져 있어(실측 확인) 기존 anon 클라이언트로 직접
  조회 가능하지만, `location`이 PostGIS 지오그래피 컬럼이라 lat/lng를
  뽑으려면 RPC가 필요하다(`st_x`/`st_y`) — 직접 `.select()`로는 불가능해
  신규 RPC를 만들었다. `service_categories`는 RLS+정책 없음(실측 확인)이라
  service_role이 필요해 신규 공개 API 라우트로 감쌌다.

## 변경 사항
### 1. DB (`scripts/migrations/2026-09-08-get-spots-by-service-category-rpc.sql`, 적용 완료)
`get_spots_by_service_category(p_service_category_id)` 신규 RPC: 반경/거리
조건 없이 `service_category_id` 등치 조건만으로 전국 조회한다.
`distance_meters`는 항상 -1(거리 정보 없음 sentinel — get-home-feed.ts/
detail-modal.tsx와 동일한 기존 관례) — 전역 조회라 서버가 기준으로 삼을
고정 원점이 없다.

### 2. 신규 공개 API
- `GET /api/nearby/service-categories`: 노출 중분류 목록 + 카운트
  (`src/lib/spaces/get-service-category-counts.ts`, 기존
  `get-spot-category-counts.ts`와 동일한 "estimated count" 패턴 재사용).

### 3. `src/lib/spaces/get-nearby.ts`
`getSpotsByServiceCategory(serviceCategoryId)` 추가 — 신규 RPC 호출 래퍼.

### 4. `src/components/map/spot-category-filter.tsx` (전면 교체)
- 데이터 출처를 `CORE_SPOT_CATEGORIES`(category_min 기반)에서
  `service_categories`(props로 주입)로 교체. 대분류 그룹핑은
  `parent_category` 문자열 매칭으로 파생(새 상태 구조 도입 없음).
- 중분류를 선택했을 때만 5/10/20km 반경 선택 칩을 시트 안에 추가로
  노출한다.

### 5. `src/components/map/map-explorer.tsx`
- `selectedCategoryId`가 이제 `service_categories.id`를 담는다.
- 신규 state: `serviceCategories`/`serviceCategoryCounts`(마운트 시 1회
  조회), `categoryItems`/`isCategoryLoading`/`categoryError`
  (`selectedCategoryId` 변경 시 재조회), `sheetRadiusKm`(5/10/20, 기본 10).
- 데이터 소스 우선순위: 검색 모드 > 노출 중분류 선택 > 기본(반경 5km).
  검색 모드는 기존처럼 카테고리 필터를 적용하지 않는다(콕 짚어 찾는 검색
  결과를 다시 좁히면 회귀가 될 수 있음 — 기존 원칙 유지).
- 바텀시트 GPS 정렬(Step 73)의 소스를 `visibleItems`(1,000건으로 잘린 뒤)
  대신 `baseItems`(잘리기 전 원본)로 바꿨다 — 노출 중분류 전국 조회는 정렬
  기준점이 없어 앞쪽 1,000건만 자르면 실제 최근접 항목이 잘려나간 뒤일 수
  있기 때문이다.
- 중분류 선택 시 지도 줌 레벨을 넓힌다(`CATEGORY_WIDE_VIEW_RADIUS_METERS`
  = 200,000m → `KakaoMapView`의 `radiusToLevel`이 지원하는 최대 레벨 10으로
  clamp됨) — 전국 데이터인데 5km 기준 줌 레벨에 머물러 있으면 "전역
  노출"이 화면상 체감되지 않기 때문이다.
- 중분류 선택 중에는 지도 드래그 재검색 버튼을 띄우지 않는다 — 이 모드의
  데이터는 지도 중심과 무관해 눌러도 아무 것도 바뀌지 않는 죽은 버튼이
  되기 때문이다.
- "전체 개수 초과" 토스트 문구를 모드별로 분기(검색/노출 중분류/기본).

### 6. 정리(고아 코드 삭제)
`GET /api/nearby/spot-category-counts`와
`src/lib/spaces/get-spot-category-counts.ts`(표준 중분류 카운트) — 스팟픽이
더 이상 이 경로를 쓰지 않고, 다른 어떤 화면도 참조하지 않음을 확인한 뒤
삭제했다. `CORE_SPOT_CATEGORIES`(category_min 기반 상수)는 관리자
화면(`spot-curations-panel.tsx`의 "키즈친화 식당" 후보 조회 등)이 여전히
쓰므로 그대로 남겼다 — 이번 결정은 "스팟픽 지도의 소비자 노출 카테고리"에
한정된다.

## 검증
- `spot-category-filter.test.tsx`: 전면 재작성(실측 service_categories
  픽스처 기준) + 반경 선택 칩 신규 테스트 3개, 16개 테스트 전체 통과.
- `map-explorer.test.tsx`: 카테고리 관련 describe 블록에
  `/api/nearby/service-categories` fetch mock 추가, 라벨을 실제 노출
  중분류 이름으로 갱신. 신규 describe 블록(전국 조회 RPC 호출 확인, 지도
  마커가 전국 조회 결과로 바뀜, 선택 해제 시 반경 기반으로 복귀) 3개 추가.
- `src/app/nearby/page.test.tsx`: 예전 "반경 선택 버튼 완전 삭제" 어서션이
  새 바텀시트 반경 칩과 문구가 겹쳐 깨졌던 것을 수정 — 두 기능이 서로 다른
  개념임을 명시하고, 새 반경 칩이 정상적으로 존재하는지로 어서션 변경.
- `npx tsc --noEmit` / `npm run test`(1329건) / `npm run build` 전체 통과.
- 마이그레이션 적용 후 RPC를 직접 호출해 "키즈카페 / 실내놀이터"
  기준 2,304건이 정확히 반환됨을 실측 확인.

## 특이 사항
- AI 추천(`rankAiRecommendedSpots`)은 기존 방침("다른 카테고리 필터와
  무관하게 항상 반경 내 전체 items(원본, 필터링 전)를 대상으로 추천")을
  그대로 유지했다 — 이번 변경 범위 밖.
- 데스크톱 좌측 패널(`aside`)의 목록/지도 마커는 노출 중분류 선택 시
  똑같이 전국 조회 결과를 쓴다(모바일 바텀시트만의 특수 동작이 아니라
  "마커 데이터 소스" 자체의 변경이므로).
