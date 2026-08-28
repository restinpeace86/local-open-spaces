# [스팟픽(/nearby) 중분류 선택 시 지도 마커 미출현 버그 긴급 디버깅]

## 요구사항
1. 프론트→API 파라미터 전달 및 `get_nearby_spaces_and_events` RPC의 WHERE 조건 전수 검사.
2. 정상 반환된 데이터가 지도 컴포넌트에 반영되지 않는지 / state가 꼬였는지 검증, 0건일 때
   유저가 인지할 수 있는지 점검.
3. 원인 수정 후 `npx tsc --noEmit`/빌드/테스트 통과 확인 후 커밋·푸시.

## 구현 일시
2026-08-29

## 0. 증상 재현 (실제 anon key 클라이언트로 브라우저와 동일하게 호출)
서울시청/강남역 좌표로 `get_nearby_spaces_and_events`를 반복 호출 → **8/8 전부 실패**
(`canceling statement due to statement timeout`). 프론트 로직(카테고리 필터, state 전달)
문제가 아니라 RPC 자체가 응답하지 못하는 DB 레벨 문제임을 즉시 확인. 무관한 단순
`count` 쿼리도 실패해 이 RPC만의 문제가 아니라 DB 전반 이슈로 범위를 넓혀 조사했다.

## 1. 원인 ① — 테이블 블로트 (부분 원인)
`pg_stat_user_tables` 실측: `open_spaces`에 dead tuple 23,137건(전체 138,491건의 16.7%,
이번 세션에서 직접 수행한 대량 UPDATE/DELETE — 중복 제거 857건, 세부 카테고리 매핑
27,101건, 레거시 카테고리 매핑 14,243건 — 로 누적, autovacuum 기본 임계치 20%에 아직
못 미쳐 자동 정리가 안 된 상태). 대표 승인 하에 `VACUUM ANALYZE public.open_spaces;`
실행 → dead tuple 0건으로 정리 확인. **그러나 이것만으로는 타임아웃이 해소되지 않음**
(직후 재검증 5/5 전부 재실패) — 별도의 더 심각한 원인이 남아있음을 시사.

## 2. 원인 ② — geometry/geography 인덱스 불일치 (진짜 근본 원인)
`EXPLAIN (ANALYZE, BUFFERS)`로 직접 확인: `open_spaces.location`/`events.location`은
`geometry` 타입이고 기존 GIST 인덱스(`idx_open_spaces_location`, `idx_events_location`)도
`geometry_ops` 연산자 클래스다. 그런데 RPC는 미터 단위 반경 계산을 위해
`st_dwithin`/`st_distance` 호출 시 `location::geography`로 캐스팅한다 — geometry 인덱스는
geography 캐스팅된 값의 연산자를 지원하지 않아 플래너가 인덱스를 전혀 못 쓰고 13만 건
전체를 `Parallel Seq Scan`(7.4초, "Rows Removed by Filter: 67742")한다. 이것이 "일시적
콜드 캐시"로 오인해왔던 지연/타임아웃의 진짜 원인이었다.

**조치**: 대표 승인 하에 `scripts/migrations/2026-08-29-add-geography-spatial-indexes.sql`
적용 — `(location::geography)` 표현식 GIST 인덱스를 `open_spaces`/`events`에 신설(기존
geometry 인덱스는 다른 geometry 연산에 계속 쓰이므로 유지). `npx supabase db query --linked
--file`로 프로덕션에 직접 적용(서비스 롤 키로는 DDL 실행 불가 — CLI 직접 접근 사용).

**검증**: `EXPLAIN ANALYZE` 재실행 결과 `Index Scan using idx_open_spaces_location_geography`로
플랜 전환 확인. 실제 RPC 반복 호출 8/8 성공, 실행 시간 163~489ms(웜 상태)로 안정화.

## 3. 부수 발견 — RPC 오버로드 충돌 (범위 외 기존 버그)
근본 원인 수정 후 모든 실제 호출 패턴(포함/미포함 `p_item_type`)으로 재검증하던 중,
`p_item_type` 없이 호출 시 `PGRST203: Could not choose the best candidate function` 에러
발견. `pg_proc` 조회 결과 `get_nearby_spaces_and_events`가 3-인자
(`user_lng, user_lat, radius_meters`)와 4-인자(`+ p_item_type`) 두 오버로드로 동시에
존재했다. PostgreSQL은 인자 개수가 다른 `CREATE OR REPLACE`를 "교체"가 아니라 신규
오버로드로 만드는데, `2026-08-25-decision-017-null-safe-source-schema.sql`이 (4-인자 버전
존재를 놓친 채) 3-인자 시그니처로 `CREATE OR REPLACE`를 실행해 3-인자 오버로드가 부활한
것으로 추정된다.

이 상태에서 `p_item_type` 없이 호출하는 `src/lib/notifications/generate-notifications.ts`
(D-1 예약 마감 알림 생성기)가 **2026-08-25 이후 계속 깨져 있었을 가능성이 높다** — 이번
작업 범위 밖이지만 사용자가 요청한 "전수 검사"로 발견한 사항이라 함께 수정했다.

**조치**: `scripts/migrations/2026-08-29-drop-stale-nearby-rpc-overload.sql`로 3-인자
오버로드만 `DROP FUNCTION`(4-인자 버전은 `p_item_type default null`이라 하위 호환 동작
완전히 동일). 적용 후 `p_item_type` 유무 관계없이 정상 동작 확인
(`SPACE: 134건, EVENT: 67건`).

다른 호출부 전수 확인: `get-all-events.ts`/`get-all-spaces.ts`는애초에 이 RPC를 쓰지 않고
테이블을 직접 조회(주석에 명시). `get-nearby.ts`는 `itemType`이 있을 때만
`p_item_type`을 스프레드하는 조건부 호출인데, 오버로드가 하나로 정리된 지금은 문제
없음. `theme-spots.ts`는 이 RPC를 호출하지 않음.

## 4. "0건" 케이스 검증 — 실제 버그 여부 확인
디버깅 중 서울시청 반경 5km SPACE 201건을 5개 체육시설 카테고리(테니스장/축구장/농구장/
풋살장/족구장)로 필터링하면 0건이 나오는 것을 발견, 버그인지 데이터 희소성인지 확인
필요했다. 실측 `category_min` 분포 확인 결과 해당 201건에는 공원/박물관/미술관/놀이터
위주 데이터만 존재하고 위 5종 체육시설 카테고리는 **애초에 존재하지 않음** → 버그가
아니라 해당 지점 주변에 실제로 그 카테고리 데이터가 없는 정상적인 결과로 결론.

## 5. 요구사항 2 — "0건일 때 유저 인지 여부" 프론트 갭 발견 및 수정
`src/components/map/map-explorer.tsx` 검토 결과, 데스크톱 좌측 패널은 로딩(`불러오는
중...`)/에러(`errorMessage`, 빨간 텍스트)/필터 결과 0건(`EmptyState`) 3가지 상태를 모두
구분해 보여주지만, **모바일 바텀시트는 `errorMessage`를 전혀 표시하지 않았다.** 실제 API
에러(예: 타임아웃) 발생 시에도 모바일에서는 `ItemListPanel`의 범용 "주변에 표시할 공간/
행사가 없습니다" 문구로만 보여, 유저가 "진짜 0건"과 "에러로 못 불러옴"을 구분할 수 없는
상태였다.

**조치**: `map-explorer.tsx`의 모바일 바텀시트 렌더링 분기에 데스크톱과 동일한
로딩/에러 상태 표시를 추가(`isLoading`/`errorMessage` 체크 후 `ItemListPanel` 렌더 조건에
동일하게 반영). 이 근본 DB 성능 수정 덕분에 실제로 에러가 발생하는 빈도 자체는
크게 줄었지만, 남아있는 예외 상황(네트워크 장애 등)에서도 유저가 상태를 정확히
인지할 수 있도록 최소 변경으로 데스크톱/모바일 파리티를 맞췄다.

## 결론 — 사용자가 제기한 프레이밍과 실제 원인의 차이
사용자는 "중분류 선택 시 파라미터/쿼리 조건" 문제로 프레이밍했으나(`category_min[]` API
파라미터 등), 실제로는 `/nearby`가 카테고리 필터를 클라이언트 사이드에서만 처리하고
있어(서버에는 카테고리 파라미터를 아예 보내지 않음) 그 자체는 버그가 아니었다. 진짜
원인은 카테고리 필터와 무관하게 RPC 자체가 만성적으로 타임아웃되고 있었던 것 — 중분류를
선택하면 그 시점에 우연히 타임아웃이 겹쳐 "마커가 안 뜬다"로 체감된 것으로 판단된다.

## 검증
- `npx tsc --noEmit` 통과
- `npm run test` 통과
- `npm run build` 통과
- 프로덕션 실측: `EXPLAIN ANALYZE` 플랜 전환 확인, RPC 반복 호출 성공 확인, 오버로드
  충돌 해소 확인

## 특이 사항
- 이번 수정은 대부분 DB 마이그레이션(인덱스 추가 1건, 오버로드 제거 1건)이며, 두 SQL 모두
  대표 승인을 받은 후 Supabase CLI(`npx supabase db query --linked --file`)로 프로덕션에
  직접 적용했다(서비스 롤 키 경로로는 DDL 실행 불가).
- `generate-notifications.ts`(D-1 알림)의 오버로드 관련 버그는 이번 작업으로 부수적으로
  해결되었으나, 이 파일 자체는 수정하지 않았다(원인이 DB 함수 시그니처에 있었으므로).
