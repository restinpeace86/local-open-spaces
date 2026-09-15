# [개선사항 1 후속] 이벤트 썸네일 재호스팅 스코프 축소 + "전체보기" DB 레벨 페이지네이션 리팩토링

## 구현 대상
1. `rehostEventThumbnails()`(2026-09-15 [개선사항 1]) 스코프 축소: "이벤트일자가 현재
   일자보다 미래인 데이터들만 고려하면 됨. 이미 현재일자보다 과거인 데이터들은 노출될
   일이 없음."
2. [개선사항 1] 구현 기록에서 "이번 범위에서 의도적으로 손대지 않은 것"으로 명시했던
   "전체보기" 페이지네이션(`fetchAllRowsChunked`/`finalizeBrowsePage`의 전체 로드 후
   메모리 내 정렬)의 DB 레벨 전면 리팩토링 — 사용자가 상세 스펙(PostGIS/Haversine
   선택 근거, LIMIT/OFFSET 페이지네이션, is_active/end_date/지역 필터 결합)을 제공.

## 구현 일시
2026-09-15

## 1) 재호스팅 배치 스코프 축소
`scripts/ingest/lib/rehost-event-thumbnails.mjs`에 `.gte('end_date', todayDate)`
필터를 추가했다. `todayDate`는 이미 존재하는
`deactivate-expired-events.mjs`의 `computeExpiryCutoffDate()`(UTC 기준 오늘, 이
프로젝트가 날짜 전용 컬럼 비교에 이미 쓰는 관례)를 그대로 재사용했다(제5장 제4조 —
같은 날짜 계산을 새로 만들지 않음). 이미 종료된 이벤트는 `deactivate-expired-
events.mjs`가 `is_active=false`로 비활성화하고 나면 유저 화면에 다시 노출될 일이
없어, 그 썸네일을 매일 100건의 배치 예산으로 재호스팅하는 것은 낭비였다.

## 2) "전체보기" DB 레벨 거리 계산/페이지네이션 리팩토링

### PostGIS vs Haversine — PostGIS 채택
- 이 프로젝트는 이미 PostGIS를 전면 채택하고 있다(`events.location`/
  `open_spaces.location`이 이미 `geography(Point,4326)`, `get_nearby_spaces_and_events`/
  `get_nearest_spot_weather` 등 기존 RPC가 전부 PostGIS를 씀).
- `events.location`에는 이미 GIST 인덱스(`idx_events_location_geography`)가 있다.
  다만 이번 쿼리는 `get_nearby_spaces_and_events`처럼 "테이블 전체에서 최근접 N개"를
  찾는 순수 KNN 검색이 아니라, `is_active`/`end_date`/`target_audience`/
  `category_min`으로 이미 좁혀진(보통 수백 건) 후보군을 거리순 정렬하는 것이라 —
  이 "좁히기" 단계가 기존 btree 인덱스(`idx_events_active_enddate`/
  `idx_events_display_filter`/`idx_events_dates`)를 그대로 활용해 원래 문제
  (141,980행 전체를 애플리케이션 메모리로 퍼올리던 것)를 해결한다. 순수 SQL
  Haversine 공식은 좁혀진 후보군에도 그 자체는 계산 가능하지만, 어떤 인덱스도 탈 수
  없고(함수 계산식은 인덱스 스캔 대상이 아님) 향후 반경 조건(`ST_DWithin`) 확장 시
  인덱스를 활용할 여지가 PostGIS에는 있지만 Haversine에는 없다.

### 페이지네이션 — LIMIT/OFFSET 채택(Keyset 대신)
기존 `PagedEvents.total`(전체 건수) 계약을 유지해야 하는데, Keyset은 총 건수를 함께
구하기 어렵다. 이 화면의 실제 규모(최대 수천 건)에서는 OFFSET이 깊어져도 성능
문제가 실질적으로 나타나지 않아 Keyset은 과설계라고 판단했다. `count(*) over()`로
페이지 안에서 총 건수를 함께 받는다(추가 왕복 없음).

### 신규 SQL (`scripts/migrations/2026-09-15-events-browse-page-db-pagination.sql`)
- `is_event_operating_on(...)`: `src/lib/spaces/event-operating-schedule.ts`의
  `isEventOperatingOn()`과 동일 로직의 SQL 이식본(정기 휴무 최우선 → 매월 N번째
  요일 → 매주 반복 요일 → 기본 허용).
- `spot_province_code(text)`/`event_province_code(text,text)`: 기존
  `normalize_address_region_prefix()`(2026-09-09 도입)를 재사용해 텍스트에서 광역
  코드를 뽑는다. 실제 "허용 광역 목록 계산"(경기↔서울 상호 포함 등,
  `getVisibleProvinces`)은 TS에 그대로 두고, SQL은 "이 행이 어느 광역인지" 판정만
  담당한다 — 이미 검증된 로직을 SQL로 이중 구현하지 않기 위함.
- `get_events_browse_page(p_mode, p_page, p_page_size, p_category_mins,
  p_visible_provinces, p_user_lat, p_user_lng, p_now)`: 기존 3개 함수
  (`getTodayEventsPage`/`getCurrentlyOngoingEventsPage`/`getReservationOpenEventsPage`)의
  서로 다른 날짜/상태 조건을 `p_mode`(`TODAY_DEADLINE`/`ONGOING`/`RESERVATION_OPEN`)로
  분기하는 단일 RPC. `RETURNS TABLE`을 `EVENT_COLUMNS`와 1:1로 맞춰 `toEventItem()`을
  그대로 재사용할 수 있게 했다.

### TypeScript 변경 (`src/lib/home/get-home-feed.ts`)
- `fetchAllRowsChunked`/`finalizeBrowsePage`/`filterByProvinceIfKnown`(전부 이 3개
  함수 전용이었음, 다른 호출부 없음 확인 후) 삭제.
- 3개 함수를 전부 `fetchBrowsePage(mode, ...)` 얇은 래퍼로 교체 — `supabase.rpc(
  'get_events_browse_page', {...})` 호출 후 결과를 `{items, total}`로 매핑한다.
  `resolveVisibleProvinces()`가 기존 `getProvinceFromText`/`getVisibleProvinces`
  (province.ts, 변경 없음)로 허용 광역 배열을 계산해 RPC에 넘긴다.
- 외부 계약(함수 시그니처, `PagedEvents` 타입, API 라우트/`event-browse-sheet.tsx`)은
  전혀 바뀌지 않아 호출부 코드 변경이 필요 없었다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1766개), `npm run build` 모두 통과.
- 운영 DB에 RPC를 직접 적용 후 실측: ONGOING(거리순 정렬, distance_meters 오름차순
  확인)/TODAY_DEADLINE(좌표 없이 end_date 폴백 정렬 확인)/RESERVATION_OPEN
  (booking_status·SEOUL_YEYAK 두 경로 모두 매칭 확인), province 필터(경기+서울 지정
  시 483건→460건으로 정확히 좁아짐), 페이지네이션(page=2 offset 정상 동작) 모두
  실제 데이터로 확인.
- `npm run dev`로 `/api/events/today`, `/api/events/ongoing`,
  `/api/events/reservation-open` 3개 라우트를 실제로 호출해 `{items, total, page,
  pageSize}` 응답이 SQL 실측과 정확히 일치함을 확인.
- `get-home-feed.test.ts`의 기존 12개 테스트(구 PostgREST 쿼리 체이닝 스텁
  `makeRangeChainable`을 목으로 삼아 필터/정렬 로직 자체를 검증하던 테스트)는 그
  로직이 SQL로 이동해 더 이상 유효하지 않아 전부 제거하고, RPC 위임 계약(올바른
  p_mode/파라미터 변환/응답 매핑)을 검증하는 11개 테스트로 교체했다 — 실제
  필터링/정렬 정확성은 위 운영 DB 실측으로 별도 확인했다.

## 이번 범위에서 의도적으로 손대지 않은 것
- `filterEventsOperatingToday`/`sortByDistanceIfKnown`/`haversineDistanceMeters`
  자체는 삭제하지 않았다 — Hero Carousel 등 다른 미리보기 함수(`getTodayEvents`/
  `getReservationOpenEvents`/`getCurrentlyOngoingEvents`, 이번 리팩토링 대상 아님)가
  여전히 이 JS 로직을 쓴다.
- Keyset 페이지네이션으로의 전환은 위 근거로 이번 범위에서 채택하지 않았다 — 페이지
  깊이가 실제로 문제가 될 규모(수백만 행)가 되면 재검토를 권장한다.
