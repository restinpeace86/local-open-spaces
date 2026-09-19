# [이벤트픽 "전체보기"/상세페이지 거리(km) 표시 누락 수정]

## 구현 대상
사용자 지시(2026-09-19): "이벤트픽의 지금 이순간 함깨ㅔ하기 좋은 알찬 픽 영역을
보면 위치가 나오고 있어 이벤트픽 메인에서 보는 카드에는 나와 거리가.. 근데
전체보기 들어가서 봤을때 안나와.. 거기서 상세페이지 보기 할때도 안나오고"

## 구현 일시
2026-09-19

## 원인
"전체보기"(`getTodayEventsPage`/`getCurrentlyOngoingEventsPage`/
`getReservationOpenEventsPage`)는 2026-09-15 리팩토링 이후 전부 단일 PostgreSQL
RPC(`get_events_browse_page`, PostGIS)에 위임한다 — 유저 좌표(`p_user_lat`/
`p_user_lng`)를 받으면 RPC가 서버에서 실제 거리를 계산해 각 행의
`distance_meters` 컬럼에 담아 내려준다(실측 확인). 그런데 그 행을 화면용
`NearbyItem`으로 바꾸는 공용 함수 `toEventItem()`은 (다른 대부분의 이벤트 조회
경로가 실제로 거리를 계산하지 않기 때문에, Task 9-1-3 결정에 따라) 항상
`distance_meters: -1`(위치 미상)로 고정해서 반환한다 — `fetchBrowsePage()`가
이 함수를 그대로 통과시키기만 해서, RPC가 애써 계산한 진짜 거리가 매번 -1로
덮어써지고 있었다.

메인 화면 카드("지금 이 순간 함께하기 좋은 알찬 픽" 등)는 이 RPC 경로를 쓰지
않고 `sortByDistanceIfKnown()`(클라이언트 좌표 기준 Haversine을 직접 계산해
`distance_meters`를 재설정)을 거치는 별도 경로라 정상 동작했다 — 그래서 메인
카드에는 거리가 보이고 "전체보기"/그 안에서 연 상세페이지(같은 NearbyItem
객체를 그대로 씀)에는 안 보였던 것.

## 코드 변경
`src/lib/home/get-home-feed.ts`의 `fetchBrowsePage()`:
```
const items = rows.map((row) => toEventItem(row));
```
→
```
const items = rows.map((row) => ({ ...toEventItem(row), distance_meters: row.distance_meters ?? -1 }));
```
`toEventItem()` 자체는 건드리지 않았다(다른 20여 곳의 호출부는 여전히 실제
거리를 계산하지 않는 것이 맞는 경로라 영향이 없어야 함) — 이 함수(RPC 결과를
쓰는 유일한 경로)에서만 RPC가 이미 계산해 둔 진짜 값을 덮어쓰기 직전에 살린다.
좌표를 안 보낸 조회(`row.distance_meters`가 null)는 기존과 동일하게 -1로
안전하게 폴백한다.

## 검증
- `src/lib/home/get-home-feed.test.ts`: 신규 테스트 2개 — "RPC가 계산한
  distance_meters를 -1로 덮어쓰지 않고 그대로 살린다", "RPC의 distance_meters가
  null이면(좌표 없이 조회) -1로 안전하게 폴백한다"(전체 76개 통과, 기존 테스트
  전부 회귀 없음 — 기존 테스트는 `browseRow()` 기본값이 `distance_meters: null`
  이라 원래도 -1이 나오는 경우만 다뤘음).
- `npx tsc --noEmit`/`npm run test`(166개 파일, 1977개 테스트)/`npm run build`
  모두 통과.
- 실측: 로컬 dev 서버로 `/api/events/ongoing?page=1&page_size=5&lat=37.3809&
  lng=127.1287` 재확인 → 실제 미터 단위 거리(9,743m/11,267m/11,267m/11,267m/
  11,368m)가 정상 반환되고 오름차순(가까운 순)으로 정렬돼 있음을 확인.

## 특이 사항
없음 — `toEventItem()`의 기존 동작(다른 호출부용 -1 sentinel)은 그대로 유지한
채, RPC 결과를 쓰는 이 한 지점에서만 정정했다.
