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
