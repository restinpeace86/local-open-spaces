# 이벤트픽 전체보기 바텀시트 도 단위 1차 필터 + 거리순 정렬 — Step 111

## 구현 대상
`implementation/todo.md` 개선사항5: "이벤트픽 서비스 내 모든 '전체보기' 바텀시트 목록의
데이터 정렬 기준을 '현재 내 위치 기준 거리 가까운 순'으로 일괄 적용. 기존 섹션별 필터
조건은 그대로 유지. 지역 필터링: 유저 현재 위치 기반(또는 수동 선택된) 도(道) 단위로
1차 필터 → 그 안에서 거리 계산 → ORDER BY distance ASC → 페이지네이션(무한 스크롤)."
적용 대상 ①오늘 전체보기 ②지금 이 순간 함께하기 좋은 알찬 픽 ③놓치면 후회하는 인기
만점 예약 픽(+ 참고: ④이벤트픽 대/중분류 선택 바텀시트도 검토).

## 구현 일시
2026-09-11

## 설계 개요
- **도 단위 1차 필터**: 스팟픽 지도(Decision 023)가 이미 쓰는 `src/lib/spaces/province.ts`
  (`getProvinceFromText`/`getVisibleProvinces`/`isSpotInProvinces`)를 그대로 재사용한다
  (요구사항 원문 "스팟픽과 동일한 구조"). 판별 실패(주소 정보 없음)면 필터하지 않는다
  (안전 폴백 — 근거 없이 스팟을 숨기지 않는다, province.ts 자체 원칙과 동일).
- **거리순 정렬**: 기존 `sortByDistanceIfKnown`(get-home-feed.ts, 이미 getCategoryMinFeed
  등에서 쓰던 haversine 기반 함수)을 재사용한다. 유저 좌표를 모르면 기존 폴백 정렬
  (end_date 오름차순, 마감임박순)을 유지한다.
- **페이지네이션과의 결합**: 기존 세 함수(`getCurrentlyOngoingEventsPage`/
  `getReservationOpenEventsPage`, 그리고 신규 `getTodayEventsPage`)는 DB `.range()`
  오프셋 페이지네이션 + `count:'exact'`를 썼다 — "정렬 후 자르기"가 정확하려면 정렬이
  페이지 경계보다 먼저 전체 데이터에 적용돼야 하는데, 도 단위 필터는 SQL로 표현하기
  어려워(주소 텍스트 매칭, province.ts 참고) 이 둘을 병행할 수 없었다. 조건에 맞는 전체
  행을 모아(`fetchAllRowsChunked`) 애플리케이션에서 필터·정렬·페이지네이션하는 방식으로
  바꿨다.
- **PostgREST `max_rows` 실측 확인**: `supabase/config.toml`의 `max_rows = 1000`이
  로컬 설정뿐 아니라 **프로덕션에도 동일하게 적용됨을 직접 확인**했다(임시 스크립트로
  `events` 테이블에 `.range(0, 1999)`(2,000건 요청)를 실제 프로덕션 DB에 호출 — 결과
  1,000건만 반환됨, 전체 `is_active=true` 2,503건 중 나머지 1,503건은 조용히 잘림).
  단일 `.select().limit(N>1000)`이나 `.range()` 한 번으로는 절대 1,000건을 넘게 받을 수
  없다는 뜻이라(추측이 아니라 실측) — `fetchAllRowsChunked`가 `.range()`를 1,000건씩
  반복 호출해 전체를 모으도록 구현했다(2026-08-29 기록상 ongoing 전국 1,972건이라
  실제로 이 우회가 반드시 필요했던 사례).

## 변경 사항
### `src/lib/home/get-home-feed.ts`
- `HomeRegion`에 `addressName?: string | null` 필드 추가 — sigunguName("성남시 분당구")은
  광역 접두가 없어 province.ts가 판별 못 하는 경우가 많아(주석 참고), Kakao 역지오코딩
  전체 주소(useUserLocation의 addressName)를 별도로 든다.
- `filterByProvinceIfKnown(items, region)` 신규 — province.ts 재사용.
- `fetchAllRowsChunked(buildQuery)` 신규 — `.range()`를 1,000건 단위로 반복 호출해 최대
  5,000건까지 안전하게 전량 수집(PostgREST max_rows 우회, 위 실측 근거).
- `finalizeBrowsePage(items, region, page, pageSize)` 신규 — 도 단위 필터 → (좌표 알면)
  거리순 정렬/(모르면) 마감임박순 폴백 → 페이지 자르기. 세 함수가 공통으로 쓴다.
- **`getTodayEventsPage` 신규**: "오늘 전체보기" 전용. 기존 `getTodayEvents`(Hero
  미리보기, `heroRegionTier` 지역 그룹핑 큐레이션)와 분리했다 — 전체보기는 그룹핑 없는
  순수 거리순 한 기준만 필요하고, Hero 미리보기는 계속 그룹핑 큐레이션이 필요해(작은
  슬라이더에 지역이 뒤섞이면 안 됨) 기존 함수를 그대로 남겨뒀다(제5장 제4조 — 기존
  구조를 건드리지 않고 새 함수로 분리). WHERE 조건은 `getTodayEvents`와 동일. 기존
  지역 선택 셀렉트(REGION_OPTIONS)는 유지하고 그 `provinceMembers`를 SQL 1차 필터로
  쓴다(요구사항 원문 "수동 선택된" 경로) — 실제 GPS 좌표는 거리 정렬에만 쓴다.
- `getCurrentlyOngoingEventsPage`/`getReservationOpenEventsPage`: `region` 파라미터
  추가, `.range()`+`count:'exact'` 단일 조회 → `fetchAllRowsChunked` + `finalizeBrowsePage`로
  교체. 기존 WHERE 조건(대분류/중분류 필터, is_active, target_audience 등)은 변경 없음.

### `src/app/api/events/{today,ongoing,reservation-open}/route.ts`
- `lat`/`lng`/`address` 쿼리 파라미터를 받아 `HomeRegion`으로 구성해 각 Page 함수에
  전달. `/events/today`는 `getTodayEvents` → `getTodayEventsPage`로 교체하고 `page`/
  `page_size` 파라미터를 추가로 받는다(기존엔 limit=60 단일 조회).

### `src/components/home/event-browse-sheet.tsx`
- 신규 `userLocation` prop(`{ lat, lng, addressName } | null`) — 부모(HomeView)의
  `useUserLocation` 값을 그대로 받아 `lat`/`lng`/`address` 쿼리 파라미터로 전달한다.
  위치 미설정(null)이면 파라미터를 보내지 않아 서버가 폴백 정렬로 동작한다.
- `MODE_META.today.paginated`: `false` → `true`(기존엔 limit=60 단일 조회라 무한 스크롤이
  없었음 — 이제 실제 페이지네이션을 지원하므로 다른 두 모드와 동일하게 켠다).
- `buildUrl`: `page`/`page_size`를 모드 구분 없이 항상 보내도록 정리(기존엔 `today`
  모드만 `region` 파라미터만 보내고 페이지 파라미터를 아예 안 보냈음).

### `src/components/home/home-view.tsx`
- `<EventBrowseSheet>`에 `userLocation={addressName ? { lat: center.lat, lng: center.lng, addressName } : null}` 전달.

## 건드리지 않은 것 (참고 사항으로 남긴 4번째 대상)
- todo.md는 "이벤트픽 대/중분류 선택 바텀시트"(`MajorCategoryGrid` → `getCategoryMinFeed`)
  역시 동일 적용을 "검토"(참고 사항, 필수 대상 아님)해 달라고 했다. 실측 확인 결과
  `getCategoryMinFeed`는 **이미** `sortByDistanceIfKnown` + `selectRegionFirst`로 좌표를
  알 때 거리순 정렬을 하고 있었다(2026-09-04 페이지네이션 도입 당시 구현) — 다만 "도
  단위 강제 1차 필터"가 아니라 "지역 우선순위 정렬 후 폴백"(regionTier, 완전 배제는
  아님) 방식이라 이번 세 함수만큼 엄격하지는 않다. 필수 대상이 아니고 기존 동작이 이미
  상당 부분 요구를 충족하고 있어, 이번 스텝에서는 추가로 손대지 않고 현황만 기록한다
  (제3장 제3조 MVP 우선 — 검증 가능한 단위로 범위를 좁힌다).

## 검증
- 프로덕션 DB 직접 호출로 PostgREST `max_rows=1000` 실측 확인(위 설계 개요 참고).
- `npx tsc --noEmit` 통과.
- `npm run test`: 129 파일 1485건 통과(신규 8건: get-home-feed.ts 도 단위 필터/거리
  정렬/폴백/페이지네이션 6건 + event-browse-sheet userLocation 쿼리 파라미터 전달 2건).
- `npm run build`: Compiled successfully.

## 특이 사항
- `getCurrentlyOngoingEventsPage`/`getReservationOpenEventsPage`의 `total`은 이제
  "도 단위 필터를 통과한 뒤"의 건수다(기존엔 필터 없는 전국 count) — 실제로 페이지네이션
  되는 결과 집합과 항상 일치해야 하므로 의도된 변경이다(제5장 제5조 데이터 중심 —
  count가 실제 화면과 어긋나면 안 됨).
- 개선사항6~10은 아직 착수 전.
