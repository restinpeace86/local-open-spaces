
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

- [x] **[Task 9-1-3] 실시간 거리 계산 제거·DB 인덱싱, 피드 중복 제거·행정구역 우선 정렬, 모바일 카드 UX** 완료 (2026-08-22)
  - **작업 목표**: 매 요청마다 수행되던 Haversine 거리 계산을 제거해 응답 속도를 높이고, sigungu_name(시/군/구) 인덱스 기반 조회·정렬로 전환. 피드 중복 제거(무료 뱃지 병합), 행정구역 우선 정렬, 모바일 Hero Carousel 1장 꽉 채우기, 위치 변경 즉시 동기화.

  - **DB sigungu_name 컬럼 신설 및 인덱싱**:
    - `scripts/migrations/2026-08-22-sigungu-name-and-indexes.sql`: `open_spaces.sigungu_name`/`events.sigungu_name` TEXT 컬럼 추가 + `is_free`/`category`(open_spaces)·`is_free`/`event_type`(events)·양쪽 `sigungu_name`에 인덱스 생성. 적용 완료.
    - `schema-mapper.mjs`에 `extractSigunguName(address)` 신설 — 실측 확인한 한국 행정구역 주소 구조("서울특별시 강남구"처럼 2번째 토큰이 바로 구인 경우 / "경기도 성남시 분당구"처럼 시 아래 구가 또 있는 2단 구조인 경우)를 판별해 정확한 시/군/구 문자열을 뽑는다. 판별 불가 시 임의 생성 없이 null.
    - `buildOpenSpaceRow`는 address로부터 sigungu_name을 자동 계산(어댑터별 수정 불필요). `buildEventRow`는 events에 공통 address 컬럼이 없어 호출부가 명시적으로 넘기도록 파라미터만 추가.
    - 이벤트 3개 소스는 실측으로 확인된 실제 원본 필드를 매핑(추측 없음): `seoul-culture-events.mjs`→`GUNAME`(구 이름 필드, 라이브 API 응답으로 실측: "강동구"/"영등포구"/"마포구" 등 확인), `seoul-yeyak-adapter.mjs`→`AREANM`(동일하게 실측: "종로구" 확인), `tour-api-festival.mjs`→`addr1`을 `extractSigunguName`으로 파싱(전국 대상이라 시/군 아래 구 2단 구조 처리 필요).
    - **백필**: `open_spaces`(26,346건)는 이미 저장된 address 컬럼에서 계산 가능해 `scripts/migrations/2026-08-22-backfill-open-spaces-sigungu-name.sql`로 DB 단에서 즉시 일괄 계산(API 재호출 없음) — 실측 샘플 확인 결과 "경기도 성남시 분당구 ..." → "성남시 분당구", "서울특별시 종로구 ..." → "종로구"로 정확히 파싱됨(전체 26,346건 중 26,169건 값 채워짐, 나머지 177건은 시/군/구 판별 불가한 주소 형식으로 null 유지 — 임의 추정하지 않음). `events`는 GUNAME/AREANM이 신규 매핑 필드라 재수집 외 백필 경로가 없어(Task 9-1-1 venue_name과 동일한 사정) 3개 어댑터 재실행: TOUR_API 20/20건, SEOUL_YEYAK 2,674건, SEOUL_CULTURE 18,961/18,979건 — 재실행 결과 `events` 전체 24,253건 중 21,473건(88.6%, Task 9-1-1 venue_name 백필 커버리지 89.4%와 동일 수준)에 sigungu_name 반영. 나머지는 이번 재수집 시점에 라이브 API 응답에 없던(종료·삭제) 구행 항목으로, 재수집 방식의 자연스러운 한계(Task 9-1-1과 동일).

  - **실시간 Haversine 거리 계산 완전 제거**:
    - `src/lib/home/get-home-feed.ts` 전면 재작성: `haversineDistanceMeters` import 및 `Origin`/`RADIUS_METERS`/`withinRadius`/`byDistance` 전부 삭제. `distance_meters`는 더 이상 계산하지 않고 기존 관례값 -1(정보 없음)로 고정 — 애플리케이션 레벨의 삼각함수 연산이 요청마다 발생하던 구조를 없앴다.
    - `Origin { lat, lng }` → `HomeRegion { sigunguName }`로 개념 전환. `DEFAULT_HOME_REGION`은 Task 9-1-1의 기본 좌표(성남시 분당구)와 동일 지역명을 계승(추측 없음).

  - **피드 중복 제거 & 뱃지 병합**:
    - `dedupeAndMergeFree()`: 이름을 공백 제거+소문자 정규화하고 sigungu_name과 묶은 키로 중복을 판별, 동일 키 항목 중 하나라도 `is_free: true`이면 병합 결과를 `is_free: true`로 승격해 1건만 남긴다. `getTodayEvents`/`getFreeFeed` 양쪽에 공통 적용.

  - **행정구역 우선 정렬**:
    - `byRegionPriority(region)`: 유저가 선택한 sigunguName과 일치하는 항목을 0순위, 그 외를 1순위로 매기는 안정 정렬(Array.sort는 stable이라 기존 최신순 정렬은 순위 그룹 내에서 유지됨). 반경 필터처럼 다른 지역 데이터를 제외하지 않고 "먼저 보여주되 다 보여준다"로 설계 — 지시서의 "1순위/2순위 노출"과 일치.
    - `/api/home/feed`: `?lat=&lng=` 좌표 파라미터를 제거하고 `?address=<유저 선택 위치명>`으로 전환, 서버에서 `extractSigunguName`으로 시/군/구를 뽑아 지역 우선 정렬에 반영.

  - **UI 위치 표기 간소화**: `formatVenueLine(address, sigunguName, distanceMeters?)` — "[장소명] · [시/군/구]"(예: "판교신미주아파트 110동 앞 바닥분수대 · 성남시 분당구", 실제 API 응답으로 확인)로 통일. `EventCard`/`HeroCarousel`은 sigunguName만 사용(홈 피드 전용). `SpaceGridCard`는 지역 도감 페이지(`/region`, `get_nearby` RPC 기반이라 sigungu_name이 없음)와 공유되므로 sigunguName이 없으면 기존 실측 거리(distance_meters)로 자연스럽게 대체해 회귀 없이 하위호환 유지.

  - **모바일 카드 UX & 위치 동기화**:
    - `HeroCarousel`: 카드 폭을 `w-[78%] sm:w-72`에서 `w-full sm:w-72`로 변경 — 모바일에서 카드 1장이 화면 폭에 꽉 차는 snap-x 스와이프로 개편(기존 5초 Auto-play/호버·터치 일시정지는 그대로 유지). sm 이상(태블릿/데스크톱)은 기존 고정폭 유지.
    - `HomeView`: 헤더에서 위치 변경 시(`addressName` 변경) `/api/home/feed?address=...`를 즉시 재호출하는 기존 useEffect 메커니즘을 좌표 기반에서 주소명 기반으로 전환 — 재조회 즉시 지역 우선 정렬이 반영된 새 피드로 화면이 재렌더링된다(실측 확인: `?address=서울특별시%20강남구`로 재조회 시 강남구 항목이 최상단으로 재정렬됨).

  - **검증**:
    - `npx tsc --noEmit`: 통과(신규 sigungu_name 컬럼 반영을 위해 `npm run gen:types` 재실행 후 통과).
    - `npm run test`: 전체 134/134 통과 — `format.test.ts`(신규 시그니처 6건), `get-home-feed.test.ts`(지역 우선 정렬 2건, 중복 제거 병합 1건 포함 전면 재작성), `home-view.test.tsx`(2건 갱신: 표기 포맷, `?address=` 재조회).
    - `npm run build`: 통과.
    - `npm run dev` 기동 후 실측: `/api/home/feed` 기본 응답 상위 항목이 모두 성남시 분당구(기본 지역)로 확인, `?address=서울특별시 강남구`로 재조회 시 강남구 항목이 최상단으로 재정렬됨을 확인. SSR 홈 페이지 HTML에서 "· 용산구"/"· 성동구"/"· 강동구" 등 실제 "[장소명] · [시/군/구]" 표기 확인. Hero Carousel 카드 DOM class에 `w-full sm:w-72` 적용 확인. 서버 로그 에러 없음.

  - **특이 사항**:
    - `formatVenueLine`은 하위호환을 위해 3번째 인자(distanceMeters)를 옵션으로 남겨뒀다 — sigunguName이 있으면 항상 우선하고, 없을 때만(지역 도감 페이지처럼 sigungu_name을 아직 채우지 않은 화면) 거리로 대체한다. 홈 피드 전용 화면(EventCard/HeroCarousel)은 2번째 인자까지만 사용한다.
    - `/region`·`/nearby` 페이지가 쓰는 `get_nearby_spaces_and_events` RPC와 `getAllOpenSpaces`는 이번 작업 범위(지시서에 명시된 get-home-feed.ts/모바일 홈 UX)에 포함되지 않아 그대로 두었다 — 해당 RPC에도 sigungu_name을 노출하려면 별도 마이그레이션/Spec 검토가 필요해 임의로 확장하지 않았다(CLAUDE.md 제7장 제4조 미래 기능 구현 금지).

  - **[추가 개선] 사용자 지시(2026-08-22 후속)**: "매일 새벽 수집 시 최대한 데이터를 채워서 적재하고, 불러올 때는 계산 없이" 원칙을 재확인하고 남은 read-time 계산을 제거했다.
    - **나이트 배치 확인**: 실제 스케줄된 GitHub Actions 워크플로(`ingest-daily.yml`→`seoul-public-reservation.mjs`/`seoul-culture-events.mjs`, `ingest-monthly.yml`→`city-park.mjs`/`cultural-spaces.mjs`, `ingest-tourapi-daily.yml`→`kor-tour`/`kor-with-tour`/`kor-pet-tour`/`go-camping`)를 전수 확인 — 전부 이미 이번 Task 9-1-3 변경(`buildOpenSpaceRow` 자동 추출 + 이벤트 3종 실제 필드 매핑)에 포함돼 있어, 앞으로의 나이트 배치는 별도 조치 없이 sigungu_name을 계속 채운다.
    - **남은 read-time 계산 제거**: `/api/home/feed`가 매 요청마다 `extractSigunguName(addressParam)`으로 주소 문자열을 재파싱하던 부분을 제거. 대신 `UserLocation`(LocalStorage) 타입에 `sigungu_name`을 추가하고, 위치를 "설정하는 시점"(`LocationOnboardingModal`의 GPS/키워드 검색 확정 시) 딱 한 번 계산해 저장한다. `useUserLocation`이 이 저장값을 그대로 노출하고, `HomeView`는 `?sigungu=<저장값>`을 그대로 넘기며, `route.ts`는 파라미터를 그대로 읽어 쓸 뿐 어떤 계산도 하지 않는다.
    - **검증**: `npx tsc --noEmit`/`npm run test`(134/134)/`npm run build` 모두 통과. `npm run dev` 실측으로 `?sigungu=강남구` 요청 시 계산 없이 그대로 반영되어 강남구 항목이 최상단으로 정렬됨을 재확인.

- [x] **[Task 9-1-2] 메인 Quick 카테고리 그리드 텍스트/아이콘 ➔ 대표 이미지 UI 개편** 완료 (2026-08-22)
  - **작업 목표**: 메인 홈 5대 Quick 카테고리 버튼을 직관적인 카테고리 대표 이미지/일러스트 에셋으로 교체
  - **이미지 에셋 소스**: 외부 디자인 에셋을 받을 방법이 없어(작업 지시에 구체적 에셋 파일 첨부 없음), 5대 UI 카테고리 색상(`category-meta.ts` 기존 색상값 그대로 재사용, 임의 변경 없음)을 배경으로 한 경량 SVG 아이콘을 직접 제작했다 — 팔레트(체험·클래스), 나무(야외·자연), 전시대(전시·박물관), 별(공연·축제), 풍선(키즈·액티비티). SVG는 지시서가 명시한 허용 포맷(SVG/WebP/PNG) 중 하나이며, 벡터라 어떤 해상도에서도 깨지지 않고 파일 크기가 각 500바이트 내외로 최소다.
  - **산출물**:
    - `public/images/categories/{experience-class,outdoor-nature,exhibition-museum,performance-festival,kids-activity}.svg` (신규 디렉터리)
    - `src/components/home/quick-category-grid.tsx`: `next/image` 기반 원형 썸네일(48×48)로 교체. `CategoryThumbnail` 서브컴포넌트가 이미지 로딩 실패(`onError`) 시 기존 단색 원 폴백으로 전환(레이아웃 깨짐 방지). 클릭 시 `/region?category=...` 연동은 기존과 동일하게 유지.
    - `src/components/home/quick-category-grid.test.tsx`(신규 3건): 이미지/라벨 렌더링, 링크 연동, 이미지 실패 시 폴백 검증.
  - **검증**:
    - `npx tsc --noEmit` / `npm run test`(전체 129/129, 신규 3건 포함) / `npm run build`: 모두 통과
    - `npm run dev` 기동 후 SSR HTML에서 5대 카테고리 이미지 `src` 경로(`/images/categories/*.svg`) 전부 확인, 각 파일 직접 요청으로 HTTP 200 + 유효한 SVG 콘텐츠 확인, 서버 로그 에러/경고 없음
