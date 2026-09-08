# 장소 단위 대표 1건 노출 + 그룹 펼쳐보기 (소비자 화면)

## 구현 대상
사용자 지시: "8월 일반캠핑존 C형(4인용, 데크형)/8월 일반캠핑존 B형(4인용,
자갈형)/8월 프리캠핑존(4인용, 잔디형) 26년 한강공원 난지캠핑장 이렇게
되어있는것들은 예약기준으로는 별도로 가는게 맞는데 장소기준으로는
난지캠핑장 하나 아니야?" → (실측 확인 후 사용자 확인) "장소 단위로 묶어서
대표 1건만 노출 하는 걸로 하자 권장하는 것처럼.. 그리고 다건에 대하여서는
클릭시 쫙 뜨는걸로 하자"

관리자 워크플로우(중복을 그룹으로 등록하는 방법)는 이미
[[2026-09-09-spot-dedup-quick-review-from-open-spaces-detail]]에서 구현했다.
이 기록은 그렇게 등록된 그룹을 **소비자 화면에 실제로 반영**하는 부분이다.

## 구현 일시
2026-09-09

## 변경 사항
### 1. `scripts/migrations/2026-09-09-group-representative-exposure.sql`
`get_nearby_spaces_and_events`, `get_spots_by_service_category` 두 RPC
모두에 `group_id` 컬럼을 추가하고, 반환 직전에
`distinct on (coalesce(group_id, id))`로 그룹당 대표 1건만 남기도록
감쌌다. group_id가 없는(그룹 미소속) 행은 자기 자신이 곧 대표가 되어
(묶음 키가 항상 자기 id) 기존 동작이 그대로 보존된다.

- `get_nearby_spaces_and_events`: 이미 "반경/카테고리로 좁혀 최대 1,001건"으로
  잘라둔 결과 위에만 dedup을 얹었다 — 원본 KNN(`<->`)/`st_dwithin` 스캔
  쿼리플랜 자체는 전혀 건드리지 않아, 앞선 세션에서 실측으로 튜닝한 성능
  특성(코드 주석에 남아있는 "BitmapAnd 결합" 등)에 영향이 없다. 대표는
  "사용자와 가장 가까운 멤버"로 뽑는다(이미 계산된 distance_meters를
  재사용).
- `get_spots_by_service_category`: 반경/거리 개념이 없어 "가장 먼저
  적재된(created_at 오름차순)" 멤버를 대표로 뽑는다 — 임의 기준이지만
  결정적(deterministic)이라 호출마다 결과가 흔들리지 않는다.
- 신규 `get_spot_group_members(p_group_id)`: "다른 옵션 더보기" 클릭 시
  같은 group_id의 전체 멤버(대표 포함)를 그대로 가져온다.

적용 시 기존 두 함수는 RETURNS TABLE 모양이 바뀌어(컬럼 추가) `drop
function` 후 `create`해야 했다(Postgres가 OUT 파라미터 변경을 `or replace`
로 허용하지 않음). 실측 검증: `spot_dedup_groups`가 현재 0건이라(관리자가
아직 실사용 전) 이번 변경은 프로덕션에서 당장은 no-op이며(모든 응답의
`count(*) === count(distinct id)` 확인), 함수 자체는 정상 동작한다
(KNN 분기 1,001건/dwithin 분기 81건/노출 중분류 분기 2,302건 모두 실측
확인).

### 2. `src/lib/spaces/get-nearby.ts`
`NearbyItem`에 `group_id?: string | null` 추가. 신규
`getSpotGroupMembers(groupId)` 함수 추가(위 RPC를 감싸는 클라이언트 함수,
`getSpotsByServiceCategory`와 동일한 패턴).

### 3. `src/components/map/detail-modal.tsx`
`item.group_id`가 있고(스팟만 해당 — 이벤트는 그룹 개념이 없음) 부모가
`onExpandGroup` 콜백을 넘겼을 때만 "🔗 이 장소의 다른 예약 옵션 보기"
버튼을 보여준다. 콜백을 넘기지 않은 화면(홈 피드/이벤트픽/캘린더 등)은
기존과 동일하게 아무것도 노출하지 않는다 — 이번 요구사항의 실제 맥락(관리자
raw-data 상세 → 스팟픽 지도)이 map-explorer.tsx 한정이라 그 화면에만
와이어링하고 다른 화면은 건드리지 않았다(제3장 제3조 MVP 우선). N건이라는
정확한 개수는 클릭 전에는 알 수 없어(추가 프리페치 없이는 조회 불가) 문구에
숫자를 넣지 않았다 — "클릭시 쫙 뜨는걸로" 요구사항 자체가 개수 사전 노출을
요구하지 않는다.

### 4. `src/components/map/map-explorer.tsx`
`handleExpandGroup(groupId)`: `getSpotGroupMembers` 호출 → 성공 시 현재
`selectedItem`(전체 상세)을 닫고 결과를 기존 `MarkerGroupModal`(겹친 마커
그룹 모달)에 태워 보여준다. 그중 하나를 고르면 기존
`handleSelectFromGroup`이 그대로 그 멤버의 전체 상세를 연다 — 신규 UI를
만들지 않고 이미 있는 "겹친 마커 처리" 목록 모달을 재사용했다(제5장 제4조
기존 구조 우선). 겹친-마커 그룹과 문구가 헷갈리지 않도록
`MarkerGroupModal`에 선택적 `title` prop을 추가해, 그룹 펼쳐보기일 때만
"이 장소의 다른 예약 옵션"으로 표시한다(기존 겹친 마커 흐름은 prop을
넘기지 않아 기본 문구 그대로 유지). 조회 실패 시 서비스가 멈추지 않게
2.5초짜리 Toast 안내만 띄우고 기존 상세 화면은 그대로 유지한다(제5장
제11조).

### 5. `src/types/database.types.ts`
`node scripts/gen-types.mjs`로 재생성 — `group_id` 필드 추가 및
`get_spot_group_members` 함수 타입 추가, 순수 추가(additive) diff만 발생.

## 검증
- `detail-modal.test.tsx`: 신규 describe(5개) — group_id 없음/콜백 미전달
  시 버튼 미노출, 버튼 클릭 시 group_id로 콜백 호출, 로딩 중 비활성화,
  이벤트는 group_id가 있어도 버튼 미노출.
- `map-explorer.test.tsx`: 신규 describe(3개) — 버튼 노출/미노출 조건,
  버튼 클릭 시 `get_spot_group_members` RPC 호출 및 그룹 멤버 목록 노출,
  멤버 선택 시 그 멤버 전체 상세로 전환.
- `npx tsc --noEmit` / `npm run test`(1346건, 기존 1338 + 신규 8) /
  `npm run build` 전체 통과.
- DB 함수 실측: KNN 분기(1,001건), dwithin+category_min 분기(81건),
  `get_spots_by_service_category`(2,302건) 모두 `count(*) === count(distinct
  id)`로 현재 no-op(그룹 0건) 상태에서 기존 동작이 보존됨을 확인.

## 특이 사항
- **초기 데이터 그루핑 범위**: 이 기록은 "그룹이 있으면 대표만 보여주고
  펼쳐볼 수 있게 하는" 소비자 측 메커니즘만 다룬다. 실제로 난지캠핑장 42건을
  그룹으로 묶는 작업 자체는 별도로, 관리자가
  [[2026-09-09-spot-dedup-quick-review-from-open-spaces-detail]]에서 만든
  "🔗 중복 스팟 검토" 버튼으로 직접 수행해야 한다(사용자 확인: "다만 해당
  범위는 현재 캠핑장으로 할까?" → 코드/메커니즘 자체는 특정 카테고리에
  종속되지 않게 일반적으로 구현했고, 실제 첫 그루핑 대상만 캠핑장으로
  시작하는 것을 권장한다). 이 기록 완료 시점까지 `spot_dedup_groups`는
  여전히 0건이라, 실제 화면에서 대표 1건 노출을 눈으로 확인하려면 관리자가
  먼저 난지캠핑장 그룹을 등록해야 한다.
