# AI 추천 노출 중분류 필터 + 클러스터링 최상단만 + 상세카드 정보 없는 영역 숨김

## 구현 대상
사용자 지시(2026-09-25, verbatim): "그리고 지금 AI 추천인가 그거 누르면
노출중분류 없는것도 다나오는데 .. 노출중분류 있는것만 나오게 해줘 어린이
뭐 아파트 놀이터라던가 다 나오더라. 그리고 지도에서 클러스터링되는거 한계
위쪽만 해. 맨처음 서울시 + 경기도 다보여줄때만... 하던가.. 클러스터링
계속 누르고 들어가니 .. 좀 가독성이나 보기가 어려워 .. 그리고 스팟픽에서
상세카드 열었을때 메뉴 , 영업시간, 가격 이거 관련하여 놀이방식당의 경우는
장소에 대한 비용없고 메뉴에 메뉴들에 대한 가격있는 경우가 대부분이라
가격란에 뭐 안들어가... 보통 찜질방의 경우는 장소에 대한 비용있고 그 안에서
음식먹을 수 있으면 메뉴에 대한 가격있을수있지.. 아무튼 정보가 없는 영역은
그냥 숨겨줘"

세 가지 별개 요청이다.

## 1) AI 추천은 노출 중분류(service_category_id) 있는 스팟만

### 원인
`rankAiRecommendedSpots()`(`src/lib/spaces/ai-recommend.ts`)가 지금까지
레거시 `category_min`(자유 텍스트 표준 중분류, 노출 중분류 정리 이전부터
있던 필드)만 체크했다. 실측 결과 `category_min`은 130,490건에 채워져 있는
반면, 진짜 노출 중분류 매핑(`open_spaces.service_category_id`)은 8,198건뿐
— 아직 매핑 안 된 스팟(예: 아파트 놀이터)도 `category_min`만 있으면 AI
추천에 섞여 나온 것이다.

### 변경 사항
- `scripts/migrations/2026-09-25-nearby-rpc-add-service-category-id.sql`
  (신규, 사용자 승인 후 적용): `get_nearby_spaces_and_events`(map-explorer가
  쓰는 5-인자 오버로드, SPACE 대상 기본 반경 조회)의 반환 테이블에
  `service_category_id`를 추가했다. **실측 발견**: `CREATE OR REPLACE
  FUNCTION`만으로는 "cannot change return type... Row type defined by OUT
  parameters is different"로 거부됐다(2026-09-09에 `group_id` 컬럼을 추가할
  때 쓴 방식과 달리, `RETURNS TABLE` 함수는 트레일링 컬럼 추가도 DROP 없이는
  안 된다) — `DROP FUNCTION` 후 `CREATE FUNCTION`으로 재생성했다. 그 외
  컬럼/로직은 기존과 완전히 동일. EVENT 쪽(`public.events`)엔 이 컬럼 자체가
  없어(실측 확인) 항상 `null::uuid`.
- `src/lib/spaces/get-nearby.ts`: `NearbyItem` 타입에 `service_category_id?:
  string | null` 추가.
- `src/lib/spaces/ai-recommend.ts`: 필터 조건을 `item.category_min` →
  `item.service_category_id`로 교체. 카테고리 다양성 라운드로빈 키는
  `category_min` 그대로 유지(매핑은 있는데 category_min이 없는 경우는
  실측 14건뿐이라 그 소수만 "null" 버킷 하나로 묶여도 영향 미미).

## 2) 클러스터링을 최상단 줌 레벨에서만

### 원인
`KakaoMapView`의 `MarkerClusterer` `minLevel`이 5였다 — 기본 반경(5km,
카카오맵 레벨 6)에서부터 이미 클러스터링이 걸려, 사용자가 확대할 때마다
클러스터를 여러 번 눌러 뚫고 들어가야 했다.

### 변경 사항
`src/components/map/kakao-map-view.tsx`: `minLevel: 5` → `10`으로 변경.
`radiusToLevel()`은 [3,10]으로 클램프되고, 노출 중분류 선택 시(전국/도
전역 노출, `CATEGORY_WIDE_VIEW_RADIUS_METERS=200km`)의 광역 뷰가 정확히 그
최대값(레벨 10)이다 — "맨 처음 서울시+경기도 다 보여줄 때"에 해당하는 그
최상단 레벨에서만 클러스터링되고, 그보다 확대한 모든 단계(기본 5km 반경
포함)는 즉시 개별 핀으로 보인다.

## 3) 상세카드 정보 없는 영역 숨김 (가격/메뉴/운영시간)

### 원인
2026-09-08 결정(`implementation/2026-09-08-price-menu-placeholders.md`)으로
가격/메뉴/운영시간 정보가 없으면 빈 화면 대신 "준비 중" 플레이스홀더 문구를
보여주도록 했었다. 사용자가 이제 이 결정을 되돌리라고 지시했다 — 놀이방식당
처럼 애초에 장소 단위 입장료 개념이 없는 업종에 "가격 정보 업데이트 준비
중입니다"라는, 사실 영원히 채워지지 않을 문구가 뜨는 게 오히려 혼란을 줬다.

### 변경 사항
`src/components/map/detail-modal.tsx` (스팟픽 등 SPACE 상세 카드,
`curation` 기반 3개 행):
- `PRICE_PLACEHOLDER`/`MENU_PLACEHOLDER`/`HOURS_PLACEHOLDER` 상수와 그
  사용처를 모두 제거.
- "가격" 행: `formatEntranceFee(curation)` 또는 `item.is_free === true`
  ("무료입장")로 실제 값이 있을 때만 렌더링, 없으면 행 자체를 숨긴다.
- "메뉴" 행: 기존과 동일하게 `category_min === KIDS_RESTAURANT_CATEGORY_MIN`
  (관리자 큐레이션이 애초에 이 카테고리만 메뉴 입력을 지원)일 때만 후보지만,
  이제 `curation.menu_items.length > 0`일 때만 렌더링한다.
- "운영시간" 행: 요일별 표(`formatCuratedHoursByDay`) 또는 단일 값 요약
  (`formatCuratedHours`/`operating_hours_raw`/`item.operating_hours`) 중
  하나라도 있을 때만 렌더링한다. (주의: 큐레이션 로딩 완료 여부와 무관하게
  `item.operating_hours`는 공공데이터라 이미 동기로 알 수 있어, 로딩 게이트를
  걸지 않고 기존과 동일하게 즉시 보여준다 — 안 그러면 있던 정보가 불필요하게
  늦게 뜨는 회귀가 생긴다.)
- EVENT 상세 카드의 `item.price_text` 행은 이번 결정 이전부터 이미 "없으면
  숨김" 방식이라 변경 없음(별개 필드/경로).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 201개 파일 2,323개 테스트 전부 통과(신규 2건 +
  `ai-recommend.test.ts`/`detail-modal.test.tsx` 기존 테스트 재작성 포함).
  `detail-modal.test.tsx`는 "가격/메뉴 행이 데이터 없을 때 숨겨지는지"를
  큐레이션 fetch→json→setCuration 3단 프로미스 체인이 끝난 뒤까지 명시적으로
  흘려보낸 뒤(`flushCurationFetch`, `act` + 매크로태스크 한 틱) 확인하도록
  보강했다(둘 다 숨겨지는 케이스라 findByText로 동기화할 시각적 신호가 없어
  기존 패턴을 그대로 못 씀).
- 실측: `get_nearby_spaces_and_events` RPC를 직접 호출해 `service_category_id`
  컬럼이 정상 반환되는지 확인(샘플 5건, 일부는 정당하게 null — 아직 노출
  중분류 미매핑 스팟).
- `npm run build`: 프로덕션 빌드 통과, 에러 없음.
- 배포 후 실제 화면에서 AI 추천에 미분류 스팟이 더는 안 나오는지, 지도
  클러스터링이 광역 뷰에서만 걸리는지, 상세카드에서 데이터 없는 가격/메뉴/
  운영시간 행이 실제로 숨겨지는지 재확인 예정(이 기록 갱신).

## 특이 사항
- `get_nearby_spaces_and_events`의 3-인자 레거시 오버로드(`p_item_type`/
  `p_category_mins` 없음)는 이번 변경 대상이 아니다 — map-explorer.tsx는
  항상 `itemType='SPACE'`를 넘겨 5-인자 오버로드만 타므로 범위 밖.
