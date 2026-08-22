- [x] **[Task 9-6-2] API1(GGCULTUREVENTSTUS) 위치 미상 이벤트 노출 — Spec 변경 수반** 🗺️ (2026-08-23 완료)
  - **배경**: Task 9-6-1에서 API1(3067건)은 원본에 주소/좌표 필드가 전혀 없어 전량 스킵됐다. 사용자가
    TITLE/HOST_INST_NM에 시/군명이 일부 포함돼 있음을 직접 확인·제시하며, (1) 매칭되는 건은 해당
    시/군 중심좌표로 근사 노출, (2) 매칭 안 되는 건도 location=null로 저장해 "경기도권 기타"로
    메인페이지에는 노출하되 지도/주변에는 절대 노출하지 않는 방식을 채팅으로 직접 승인함(2026-08-23).
  - **Spec 충돌 확인 및 변경 승인**: `project/database_schema.md`에 `events.location NOT NULL`이 이미
    명시돼 있어(Decision 002 연동) 임의 변경 불가 사안이었음 — AskUserQuestion으로 "스펙까지 함께
    변경할지" 재확인 후 "지금 스펙까지 함께 변경" 명시적 승인 받음(Decision 009로 기록).
  - [x] `project/database_schema.md` / `project/decision-log.md`(Decision 009) 갱신
  - [x] 마이그레이션 작성/적용: `scripts/migrations/2026-08-23-events-location-precision.sql`(location NOT NULL 해제 + location_precision 컬럼(EXACT/CITY_APPROX/UNKNOWN) + 값/정합성 CHECK 제약), `scripts/migrations/2026-08-23-nearby-rpc-exact-precision-only.sql`
  - [x] `get_nearby_spaces_and_events` RPC에 `location_precision = 'EXACT'` 필터 추가 — **실측 검증**: 성남시 CITY_APPROX 이벤트 69건이 몰려있는 정확한 좌표를 반경 100m로 직접 질의해도 EVENT 0건(SPACE만 1건) 반환 확인, 즉 근사/미상 좌표가 지도/주변에 절대 노출되지 않음을 실제 RPC 호출로 증명함
  - [x] `schema-mapper.mjs`의 `buildEventRow` 가드 완화(`locationPrecision` 파라미터, 기본값 'EXACT'로 기존 어댑터 전부 하위호환 유지 확인)
  - [x] `gg-culture-events-adapter.mjs` API1 처리: 경기도 31개 시/군명 매칭(동음이의어 오탐 방지: 화성/구리/이천/오산/여주/광주는 "시/군" 접미사 필수, "경기 광주"는 예외 인정) → 시/군 중심좌표 근사(CITY_APPROX) / 미매칭 → UNKNOWN(location null)로 행 생성
    - **실측으로 발견해 수정한 버그**: 시/군 중심좌표를 "경기도 {시/군}청"(시청/군청 건물명)으로 지오코딩하면 수원시청·경기도청 등 일부만 성공하고 하남시청/파주시청 등은 VWorld 주소 DB에 건물명으로 등록돼 있지 않아 NOT_FOUND였다. "청"을 뺀 행정구역명 자체("경기도 하남시")로 바꾸니 31개 시/군 전부 지오코딩 성공(실측 확인) — 오히려 특정 건물이 아닌 지역 자체의 대표 좌표라 "시/군 중심좌표 근사"라는 의도에 더 부합.
  - [x] `get-home-feed.ts`에 `getProvinceWideEvents()` 추가(location_precision='UNKNOWN', is_active, end_date>=오늘, 종료임박순) + `src/app/api/home/province-feed/route.ts` 신규
  - [x] `home-view.tsx`에 "🗺️ 경기도권 기타" 섹션 추가(기존 FeedCard/EventCard 재사용, useInView 지연 페칭) — 테스트 회귀 수정: FreeFeedSkeleton의 aria-label을 파라미터화(같은 라벨 중복으로 getByRole 모호해지는 문제 해결), useInView 훅 선언 순서 조정(FakeIntersectionObserver.instances.at(-1) 관례 유지)
  - [x] `detail-modal.tsx`: location_precision !== 'EXACT'인 경우 미니맵/크게보기/길찾기 버튼 숨기고 "정확한 위치 정보 없음" 안내 문구로 대체
  - [x] `database.types.ts` 갱신 (location 옵셔널, location_precision 필드 추가)
  - [x] 재수집 실행: API1 2952건 신규 적재(EXACT 24,500건은 API2 등 기존 소스 그대로, CITY_APPROX 1,560건, UNKNOWN 1,369건). 성남시 CITY_APPROX 69건 확보(Task 9-6-1에서 0건이었던 것과 대비).
  - **정직하게 남기는 한계**: API1 2929건 중 종료일이 오늘 이후인("현재/향후 진행") 건은 49건뿐이고 나머지 2,880건(약 98%)은 이미 종료된 과거 행사였다(원본 API가 지나간 행사까지 그대로 보관하는 이력성 데이터셋으로 보임 — WRITNG_DE 최신 표본에도 과거 END_DE가 섞여 있음, 실측 확인). 그래서 성남시 CITY_APPROX 69건 중에도 "오늘 진행 중"인 것은 0건이라 홈 Hero 피드에는 아직 표시되지 않는다 — 이는 날짜 필터링이 정상 동작한 결과이지 지역 매칭 파이프라인의 결함이 아니다(직접 SQL로 검증). 과거 이벤트를 수집 시점에 걸러낼지는 별도 정책 결정 사안이라 이번 범위에서 임의로 필터링하지 않았다.
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 229/229 통과(신규 어댑터 테스트 6건 추가), `npm run build` 통과. 개발 서버로 `/api/home/province-feed`(UNKNOWN 이벤트, lng/lat=0, location_precision='UNKNOWN' 확인) 및 RPC 직접 호출(성남시 CITY_APPROX 좌표 100m 반경에서 EVENT 0건) 실측 검증 완료.
  - **관련 파일**: `project/database_schema.md`, `project/decision-log.md`(Decision 009), `scripts/migrations/2026-08-23-events-location-precision.sql`, `scripts/migrations/2026-08-23-nearby-rpc-exact-precision-only.sql`, `scripts/ingest/adapters/lib/schema-mapper.mjs`, `scripts/ingest/adapters/gg-culture-events-adapter.mjs`(+test), `src/lib/home/get-home-feed.ts`, `src/lib/spaces/get-nearby.ts`, `src/app/api/home/province-feed/route.ts`(신규), `src/components/home/home-view.tsx`, `src/components/home/free-feed-skeleton.tsx`, `src/components/map/detail-modal.tsx`, `src/types/database.types.ts`.

- [x] **[Task 9-6-1] 경기데이터드림 2개 API 연동 및 성남시/경기도 이벤트 대량 수집** 🎪 (2026-08-22 완료)
  - **작업 배경**: `localdata.go.kr` 서비스 폐기에 따라 `data.go.kr` 및 경기데이터드림 오픈 API로 수집 출처 단일화.
  - **수집 대상 API**:
    1. `https://openapi.gg.go.kr/GGCULTUREVENTSTUS` (경기도 문화 행사 현황)
    2. `https://openapi.gg.go.kr/GGCULFOUEVENSTM` (경기문화재단 행사 프로그램)
  - **세부 작업 지시**:
    1. **어댑터 보완 (`src/lib/ingestion/adapters/gg-events.mjs`)**:
       - 2개 API를 순회하며 `Type=json`, `pIndex`, `pSize=1000`, `KEY=process.env.GG_DATA_API_KEY` 기반 JSON 파싱.
       - 시군명 및 주소 파싱 (`SIGUN_NM`, `ADDR` ➔ `sigungu_name`: '성남시 분당구' / '성남시').
       - 행사 기간(`BEGIN_DE`, `END_DE`), 행사명(`TITLE`), 장소(`INST_NAME`/`ADDR`), 이미지/URL 및 위경도 좌표 매핑.
    2. **수집 실행 및 DB 백필**:
       - 스크립트 실행으로 성남시 및 경기도 지역 이벤트 수집 및 `events` 테이블 적재.
    3. **피드 매칭 검증**:
       - DB 내 성남시/경기도 `events` 카운트 실측.
       - `get-home-feed.ts` 실행 시 성남시 분당구 설정 상태에서 메인 및 당일 이벤트 피드 정상 피딩 검증.
  - **완료 보고 (2026-08-22, 추측 금지 원칙에 따라 실측 그대로 기록)**:
    - **지시서 필드명과 실제 API 응답 불일치 확인**: 지시서의 `SIGUN_NM`/`ADDR`/`INST_NAME`/`TITLE`은 두 API 어디에도 존재하지 않았다. 직접 호출·전수 표본 조사로 확인한 실제 필드는 다음과 같다.
      - API1(`GGCULTUREVENTSTUS`, 1,000+건): `INST_NM`, `TITLE`, `CATEGORY_NM`(행사/공연/교육/전시 4종), `URL`, `HOST_INST_NM`, `IMAGE_URL`, `BEGIN_DE`, `END_DE` 등. **주소/시군구/위경도 필드가 전혀 없음**(20건 표본 전수 확인). `INST_NM`/`HOST_INST_NM`은 주최 "기관명"이지 행사 장소가 아니어서 지오코딩 근거로 쓸 수 없다(추측 금지) — 따라서 이 API 항목은 `buildEventRow`의 좌표 필수 검증에 의해 전량 스킵됨. **코드 결함이 아니라 원본 API 자체에 위치 정보가 없는, 실측으로 확인된 한계**다.
      - API2(`GGCULFOUEVENSTM`, 179건): `DIV_NM`(안정적 ID), `TITLE_NM`, `BGNG_NM`/`END_NM`, `LOC_NM`(장소/주소 텍스트, 형식 제각각), `CLASS_NM`(자유 태그 나열) 등. `LOC_NM`을 지오코딩 대상으로 사용.
    - **기존 `gg-events-adapter.mjs`(GgEventsAdapter, `GG_EVENTS`, 공공 수영장/물놀이형 수경시설 → `open_spaces`)는 이름만 비슷할 뿐 전혀 다른 데이터셋임을 확인**하고 절대 덮어쓰지 않음(제5장 제4조 기존 구조 우선) — 신규 파일 `scripts/ingest/adapters/gg-culture-events-adapter.mjs`(`GgCultureEventsAdapter`, `sourceKey: GG_CULTURE_EVENTS`, `targetTable: events`)를 별도 신설.
    - **지오코딩 오매칭 버그 발견 및 수정**: dry-run 중 "삼남길 제6길 화성효행길, ..."(도보 코스 구간명 나열, 실제 주소 아님)이 VWorld에 의해 울산/경주 인근 좌표로 "성공" 반환되는 오매칭을 발견 — 성공처럼 보이지만 잘못된 위치 데이터가 조용히 적재될 뻔한 더 위험한 버그였다. 이 소스는 경기도 전용이므로 `GYEONGGI_BOUNDS`(경도 126.0~128.0, 위도 36.7~38.5) 범위 밖 좌표는 오매칭으로 간주해 건너뛰도록 수정, 회귀 테스트 추가로 재발 방지.
    - **DB 적재 결과 (실행 완료)**: API1 0건(원본 API 자체에 위치 데이터 없음, 위 설명대로 정상적인 스킵), API2 23건 신규 적재(`GG_FOUNDATION_EVENT_*` external_id). 성남시 관련 신규 row는 0건 — 이번 API2 원본 179건 표본 자체에 성남시 행사가 없었기 때문(안산시 1건, 시흥시 1건은 신규 확보). **"성남시 대량 수집" 목표는 이 배치에서는 달성되지 못했음을 있는 그대로 보고** — 원본 데이터셋 자체가 현재 성남시 행사를 포함하고 있지 않아 발생한 결과이며, 코드/파이프라인 결함은 아니다.
    - **피드 매칭 검증**: 직접 SQL(`ILIKE '%안산시%'`)로 신규 안산 row가 정상 매칭됨을 확인. `curl /api/home/feed?sigungu=안산시...` 라이브 테스트에서는 신규 row가 "오늘 진행 중"(getTodayEvents) 또는 "이번 주"(endOfThisWeek) 필터 조건을 만족하지 못해(신규 안산 행사 2건 모두 날짜가 오늘/이번 주 범위 밖) 피드에 보이지 않았으나, 이는 이미 확립된 날짜 필터링 로직의 정상 동작이지 지역 매칭 파이프라인의 결함이 아님을 SQL 직접 검증으로 별도 확인함.
    - **검증**: `npx tsc --noEmit` 통과, `npm run test` 224/224 통과(신규 어댑터 단위테스트 13건 포함), `npm run build` 통과.
    - **관련 파일**: `scripts/ingest/adapters/gg-culture-events-adapter.mjs`(신규), `scripts/ingest/adapters/gg-culture-events-adapter.test.mjs`(신규, 13 tests), `scripts/ingest/gg-culture-events.mjs`(신규 CLI), `package.json`(`ingest:gg-culture-events` 스크립트 추가).
