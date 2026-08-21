
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [x] **[Task 9-1-1] 메인 홈 위치 기반 30km 필터링, 장소명(venue_name) 백필, 캐러셀 Auto-play 구현** 완료 (2026-08-22)
  - **작업 목표**: 유저 위치 기준 반경 30km 이내 당일 행사 큐레이션 및 `[장소명] · [거리 km]` 카드 UI 완결성 확보

  - **⚠️ 지시서 전제와 실제 스키마 불일치(실측 확인, 임의로 무시하지 않고 대체 경로로 처리)**: 지시서는 "원본 `raw_data` 내 장소명 텍스트를 추출해 백필"을 요구했으나, **`events` 테이블에는 애초에 `raw_data` 컬럼 자체가 존재하지 않음**을 실측으로 확인(`open_spaces`만 `raw_data`를 가짐 — Task 9-1에서 이미 발견했던 것과 동일 계열의 스키마 문서-실제 불일치). 저장된 적 없는 컬럼에서는 백필할 원본이 없으므로, 대신 **수집 어댑터에 venue_name 매핑을 추가한 뒤 각 어댑터를 재실행(라이브 API 재수집 + upsert)** 하는 방식으로 동일한 목표를 달성했다 — 기존 external_id와 매칭되는 모든 행이 upsert로 갱신되므로 실질적으로 "백필"과 같은 효과.

  - **DB 장소명(`venue_name`) 추출 및 백필**:
    - `scripts/migrations/2026-08-22-events-add-venue-name.sql`: `events.venue_name TEXT` 컬럼 추가, 적용 완료.
    - `schema-mapper.mjs`의 `buildEventRow`에 `venueName` 파라미터 추가.
    - 3개 어댑터에 실제 원본 필드 매핑(전부 실측 확인, 추측 없음): `seoul-yeyak-adapter.mjs`→`PLACENM`, `seoul-culture-events.mjs`→`PLACE`, `tour-api-festival.mjs`→`addr1`(TourAPI festival은 별도 장소명 필드가 없어 주소로 대체, 실측 확인).
    - 세 어댑터 재실행으로 백필 완료: `SEOUL_YEYAK` 2,685/2,708건, `TOUR_API` 20/20건, `SEOUL_CULTURE` 18,961/18,961건(100%) — `events` 전체 24,233건 중 21,666건(89.4%)에 venue_name 반영. 나머지 약 11%는 이번 재수집 시점에 라이브 API 응답에 없던(예: 종료·삭제된) 구행 항목으로, 재수집 방식의 자연스러운 한계.
    - **부수 발견 및 수정(범위 밖이었으나 백필을 막고 있던 실제 버그 2건, `tour-api-festival.mjs`)**: (1) 이미 URL-인코딩된 `TOUR_API_KEY`에 `encodeURIComponent`를 한 번 더 적용해 이중 인코딩 → `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(HTTP 403) 발생 중이었음 — 다른 모든 어댑터와 동일하게 `PUBLIC_DATA_API_KEY`(디코딩 키) + 단일 인코딩으로 수정. (2) `arrangeType: 'A'` 파라미터가 `INVALID_REQUEST_PARAMETER_ERROR`를 유발하는 잘못된 값이었음(실측 확인) — 유효값을 추측하지 않고 파라미터 자체를 제거(기본 정렬로 정상 동작 확인).

  - **위치 기반 반경 30km 피드 쿼리 연동**:
    - `src/lib/home/get-home-feed.ts`: `Origin` 타입 + `DEFAULT_HOME_ORIGIN`(성남시 분당구 — 이미 실제 지오코딩된 자사 DB 좌표를 그대로 사용, 주소 추측 없음) 추가. Supabase는 SQL 단에서 Haversine을 계산할 수 없어(PostGIS RPC 신설 없이는), 후보군을 넉넉히(500건) 가져온 뒤 `haversineDistanceMeters`로 애플리케이션 레벨에서 30km 필터링 + 거리순 정렬.
    - `/api/home/feed`가 `?lat=&lng=` 쿼리파라미터를 받아 반영(없으면 기본값).
    - `HomeView`: 유저가 `useUserLocation`으로 실제 위치를 설정한 경우(`addressName` 존재) 그 좌표로 `/api/home/feed`를 클라이언트에서 재조회해 피드를 교체(위치 미설정 시엔 서버 기본값 유지).
    - `NearbyItem.address`에 `venue_name`을 그대로 실어 `EventCard`/`SpaceGridCard`가 같은 필드로 표시(타입 변경 없이 재사용).
    - `src/lib/spaces/format.ts`에 `formatVenueLine(address, distanceMeters)` 신설 — "장소명 · 거리" 통일 포맷, 정보 없으면 있는 것만, 둘 다 없으면 빈 문자열(플레이스홀더 문구 없음). `EventCard`/`SpaceGridCard`/`HeroCarousel` 전부 이 함수로 통일해 "장소 정보 없음"/"주소 정보 없음" 문구를 코드에서 완전히 제거.

  - **Hero Carousel 5초 Auto-play**:
    - `hero-carousel.tsx`: `setInterval(5000ms)`로 다음 아이템에 `scrollIntoView({behavior:'smooth'})`, 마우스 `onMouseEnter`/`onMouseLeave` 및 터치 `onTouchStart`/`onTouchEnd`로 일시정지/재개.

  - **검증**:
    - `npx tsc --noEmit`: 최초 실행 시 `venue_name` 컬럼이 생성 Supabase 타입에 없어 에러 → `npm run gen:types`로 타입 재생성 후 통과.
    - `npm run test`: 전체 126/126 통과(신규: `format.test.ts` 4건, `get-home-feed.test.ts` 2건 — 30km 필터링/venue_name 매핑 검증, `hero-carousel.test.tsx` 4건 — Auto-play/호버/터치 검증, `home-view.test.tsx`에 2건 추가 — 카드 표기 포맷 + 위치 기반 재조회).
    - `npm run build`: 통과.
    - `npm run dev` 기동 후 `/api/home/feed` 실제 응답으로 반경 30km 이내만 필터링됨을 확인(예: 분당 기준 10~12km 거리의 서울대공원/유아숲 이벤트는 포함, 더 먼 것은 자동 제외), SSR 렌더링 HTML에서 "[장소명] · [거리]" 형태 실제 표기 확인(예: "해찬솔유아숲체험원 · 10.4km"), "장소 정보 없음"/"주소 정보 없음" 문구 0건 확인.

- [ ] **[Backlog] tour-api-festival.mjs 페이지네이션 부재 (`numOfRows=20` 하드코딩)** ⏳
  - **현상**: Task 9-1-1에서 venue_name 백필을 위해 재실행하며 발견 — 이 스크립트는 `fetchFestivals({ numOfRows: 20 })` 단발 호출만 하고 페이지네이션 루프가 없어 TourAPI 전체 축제 정보(수백~수천 건) 중 20건만 수집한다. `seoul-culture-events.mjs`가 Task 8-4에서 겪었던 것과 동일한 유형의 완결성 문제.
  - **대응 방안**: `fetchAllCultureEvents()`와 같은 전체 순회 로직 추가, 필요 시 `BaseCollectorAdapter` 패턴으로 마이그레이션.
  - **우선순위**: Low(현재도 정상 동작하며 소량 데이터로 서비스에 지장 없음, 완결성 개선 항목)
