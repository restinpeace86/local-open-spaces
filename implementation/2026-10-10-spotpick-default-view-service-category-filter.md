# 스팟픽 기본 화면도 노출중분류 매핑된 스팟만 노출 (Decision 030)

## 구현 대상
사용자 지적(2026-10-10): "스팟픽에 내가 계속 노출 중분류 있는 것만
나오고 노출중분류만 보여야한다고 하지 않았어 ? 왜 안그런것도 보여? ...
이건 로그인안한 유저든 한유저든 전부 마찬가지인데." → 조사 후 "카테고리
선택 시에만 적용" 으로 잘못 보고 → 사용자 정정: "아무 카테고리도
안고른 기본화면도 노출중분류의 하나의 카테고리만 선택한게 아니라
노출중분류가 매핑된 데이터들 중에서 반경내 전체 스팟을 보여주는거야..
내가 전제조건을 노출중분류가 매핑됐는지로 얘기했을텐데?" → 추가로
"노출중분류 없는데 나오는 경우(이벤트↔스팟 연동, 글쓰기 시 스팟 매핑)는
의도된 예외"라는 맥락 보강.

## 구현 일시
2026-10-10

## 실측 확인 — 원인과 수정

### 원인
`get_nearby_spaces_and_events` RPC의 `p_category_mins is null`(카테고리
미선택, 기본 지도 화면) 분기가 `open_spaces` 쿼리에 `service_category_id`
를 전혀 거르지 않고 있었다 — `location_precision='EXACT'`와 그룹 대표
1건 조건만 걸고 있었다. 카테고리를 선택했을 때 쓰는 `get_spots_by_
service_category` RPC는 원래부터 올바르게 동작하고 있었다.

### 수정 1 — WHERE 조건 추가
해당 분기의 SPACE 쿼리에 `and s.service_category_id is not null` 추가.

### 수정 2(실측으로 발견한 성능 회귀) — 부분 GiST 인덱스 추가
조건만 추가하고 인덱스 없이 테스트하니 EXPLAIN(ANALYZE)로 4,449ms가
나왔고, 실제 PostgREST(anon 롤) REST 호출로도 `statement timeout`
500 에러가 났다(라이브로 직접 재현 확인) — 기존 GiST 인덱스로 거리순
(KNN) 스캔하면서 매핑 안 된 86%를 하나씩 걸러내다 보니(매핑 비율
7.4%뿐이라 limit 1001을 채우려면 ~13,500건을 훑어야 함) 느려진 것.
`service_category_id is not null`로 걸러진 부분 인덱스
(`idx_open_spaces_location_geography_mapped`)를 추가하자 173ms로
돌아왔다(25배 단축). 같은 REST 호출을 다시 재현해 200 응답(195~723ms)
을 확인했다.

### 의도된 예외(건드리지 않음) — 사용자 확인
- **이벤트→스팟 연동**: 이벤트에 연결된 장소를 보러 올 때는 노출중분류
  없이도 한시적으로 보여야 한다 — `/api/events/linked-spot`이
  `events.space_id` FK로 `open_spaces`를 직접 조회할 뿐, 이번에 수정한
  RPC와 완전히 별개 경로라 영향 없음을 확인했다.
- **글쓰기 시 스팟 매핑**: 맘스픽 리뷰 작성 시 노출중분류 없는 스팟도
  DB에 있으면 매핑할 수 있어야 한다 — `spot-picker.tsx` →
  `/api/spots/search` → `searchSpacesNationwide()`도 `service_category_id`
  를 전혀 조회/필터하지 않는 별개 경로라 영향 없음을 확인했다.

## DB 변경
`scripts/migrations/2026-10-10-nearby-rpc-default-view-require-service-
category.sql`(적용 완료): 부분 GiST 인덱스
`idx_open_spaces_location_geography_mapped` 신규 + `get_nearby_spaces_
and_events` 함수 재정의(반환 타입/파라미터 시그니처 동일, WHERE 조건만
추가). `p_category_mins`가 있는 분기(카테고리 선택 시,
`getNearbyKidsRestaurants` 등)와 EVENT 쪽은 건드리지 않음.

## 변경 사항
- TypeScript 코드 변경 없음 — RPC 내부 로직만 바뀌고 반환 스키마는
  그대로라 `get-nearby.ts`/`map-explorer.tsx` 호출부는 전혀 안 바뀜.
- `spec/map/spatial-search.md` §2.1 "노출 중분류 미선택 시(기본 화면)"
  항목 정정.
- `project/decision-log.md`에 Decision 030 추가(Decision 022 정정 기록).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,186개**,
  TS 변경 없어 전부 그대로 통과) / `npm run build` 전부 통과.
- 라이브 REST 호출(anon 키, 실제 브라우저 호출과 동일 경로)로 재현:
  - 인덱스 추가 전: `500 statement timeout`.
  - 인덱스 추가 후: `200`, 195~723ms, 판교 5km 기준 SPACE 34건 전부
    `service_category_id` 채워짐 확인.
- 이벤트→스팟 연동/글쓰기 스팟 매핑 경로는 코드 리딩으로 완전히 별개
  함수임을 확인(라이브 재현은 로그인 세션이 필요해 이번엔 생략).

## 특이 사항
- 스팟픽 지도의 "검색창"(`/api/spots/search` → `searchSpacesNationwide`)
  도 같은 엔드포인트를 글쓰기 스팟 매핑과 공유하고 있어
  `service_category_id`를 전혀 거르지 않는다 — 검색 결과에도 노출중분류
  없는 스팟이 뜰 수 있다는 뜻이다. 이번 사용자 지적은 기본 지도 화면
  (핀 로딩)에 한정됐고, 검색창이 글쓰기 스팟 매핑과 분리해야 하는
  대상인지는 별도 확인이 필요해 이번 범위에 포함하지 않았다.
