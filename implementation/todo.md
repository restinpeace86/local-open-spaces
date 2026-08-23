- [x] **[Task 9-6-6] 오늘 전체보기 페이지(`/events/today`) 신설, 행정구역 계층 피딩 적용 & 4단계 지오코딩 파이프라인 표준화** 🎯 (2026-08-23 완료)
  - **작업 목표**: 거리(GPS) 기반 피딩을 배제하고 행정구역 계층 기반 피딩을 적용한 '오늘 전체보기' 카드 그리드 페이지 구축 및 4단계 정교화된 지오코딩 표준 파이프라인 구현.

  - **Part 1. 오늘 전체보기 전용 목록 페이지 신설 & 행정구역 계층 피딩 (`/events/today`)**:
    1. **행정구역 계층 피딩 로직 개편 (`get-today-events.ts` / `/api/events/today`)**:
       - 거리(distance) 정렬 및 피딩 전면 제거.
       - 선택된 지역 기준 계층 정렬: `1순위: 성남시 분당구` ➔ `2순위: 성남시` ➔ `3순위: 경기도`. 타 광역시/지자체(서울 서초구 등) 피딩 완전 차단.
    2. **오늘 전체보기 카드 그리드 화면 신설 (`src/app/events/today/page.tsx`)**:
       - 상단: 선택 가능 관심 지역 **[지역 선택 스위처/드롭다운]** 배치 (예: 성남시 분당구, 서울시 서초구 등).
       - 메인: 카드 그리드 형태로 당일/시즌 이벤트 리스트 노출.
    3. **홈 화면 연결 (`home-view.tsx`)**:
       - 메인 홈의 "오늘 전체보기+" 버튼 클릭 시 지도가 아닌 `/events/today` 목록 화면으로 라우팅.

  - **Part 2. 4단계 지오코딩 파이프라인 표준화 & 토큰 정규화 정제**:
    - **4단계 순차 파이프라인** (성공 시 `break` 후 DB `EXACT` 업데이트, 4단계 실패 시 좌표 없이 `UNKNOWN` 처리):
      1. **1단계**: VWorld 도로명/지번 지오코딩.
      2. **2단계**: Kakao REST API (`KAKAO_REST_API_KEY`) 키워드/장소 검색 (`https://dapi.kakao.com/v2/local/search/keyword.json`).
      3. **3단계**: 상세 URL 크롤링('장 소' 텍스트 추출) ➔ VWorld/Kakao 지오코딩.
      4. **4단계**: 토큰 정규화 정제 ➔ VWorld/Kakao 재지오코딩.
    - **4단계 토큰 정규화 규칙**:
      - **실/층/홀 단위 제거**:
        * 예: `'광주시문화예술의전당 맹사성홀'` ➔ `'광주시문화예술의전당'`
        * 예: `'강진 다산박물관 2층 다목적홀'` ➔ `'강진 다산박물관'`
      - **'및' 키워드 이하 절단**:
        * 예: `'과천시민광장 및 과천시민회관 일대'` ➔ `'과천시민광장'`
        * 예: `'양평군 세미원 및 두물머리'` ➔ `'양평군 세미원'`

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - `/events/today` 진입 시 타 지자체 차단 및 카드 그리드 정상 표출 검증.
    - 4단계 지오코딩 적용 후 `EXACT` 승격 건수 및 미변환건 `UNKNOWN` 처리 실측 보고.

  - **구현 결과**:
    - **Part 1**: `src/lib/home/get-home-feed.ts`의 `HomeRegion`에 `provinceMembers`(선택) 필드를 추가하고, `fetchRegionFirstRows`의 3순위(부족분 채우기) 조회 단계를 "지역 제한 없는 전체 조회"에서 "provinceMembers 목록으로만 제한된 조회"로 바꿨다 — 이 필드를 넘기지 않는 기존 호출부(Hero Carousel 등)는 동작이 전혀 바뀌지 않는다(옵션 필드라 하위 호환 100%, 실측: 기존 24개 테스트 그대로 통과). 신규 `src/lib/geo/region-hierarchy.ts`에 경기도 31개 시/군, 서울 25개 자치구 고정 목록(공식 행정구역명이라 추측 아님)과 `REGION_OPTIONS`(성남시 분당구 기본/서울시 서초구)를 정의. `src/app/api/events/today/route.ts` 신규 API가 `getTodayEvents()`를 그대로 재사용하되(제5장 제4조 기존 구조 우선, 새 함수 만들지 않음) `provinceMembers`를 넘겨 3순위까지도 도 경계를 벗어나지 않게 한다. `src/app/events/today/page.tsx` 신규 페이지가 상단 지역 스위처(드롭다운) + `EventCard`/`DetailModal`/`EmptyState` 기존 컴포넌트를 재사용한 카드 그리드로 구성됨. `home-view.tsx`의 "오늘 전체보기+" 링크를 `/region?...`(직전 사용자 피드백 대응 임시 목적지)에서 최종적으로 `/events/today`로 변경.
      - **실측 검증**: 개발 서버 기동 후 `/api/events/today`(기본 성남시 분당구)와 `/api/events/today?region=seoul-seocho` 실제 호출 결과가 서로 다른 지역 데이터셋을 반환함을 확인. 성남시 분당구 쿼리 결과 41건의 `sigungu_name`을 전수 조사한 결과 전부 경기도 31개 시/군 중 하나였고(예: "서울시 과천시"처럼 서울시 운영 시설이지만 실제로는 과천시에 위치한 경우도 정상적으로 3순위 경기도 목록에 포함됨), 서초구 소속 단독 데이터는 전혀 섞이지 않음을 확인 — "타 지자체 완전 차단" 요구사항 충족. `/events/today`, `/`(홈) 페이지 HTML도 직접 curl로 확인해 기대한 문구/링크가 실제로 렌더링됨을 검증.
    - **Part 2**: `gg-culture-location-enrichment.mjs`의 `geocodeVenueOrNull`을 "1단계 VWorld → 2단계 Kakao → (3단계는 이 소스 특성상 크롤링이 지오코딩용 텍스트를 얻는 선행 단계라 1·2단계 이전에 옴, 주석에 명시) → 4단계 토큰 정규화 재시도" 구조로 문서화하고, 4단계에 새 `truncateAtAndKeyword()`("및" 이하 절단)를 추가해 기존 `stripRoomFloorDescriptor()`(실/층/홀 제거)와 `normalizeVenueText()`로 합성했다(및-절단 우선 적용 후 남은 실/층 단위 제거).
      - **실측 결과**: 지시서 예시 "과천시민광장 및 과천시민회관 일대"→"과천시민광장", "양평군 세미원 및 두물머리"→"양평군 세미원" 둘 다 실제 DB 데이터에 존재하는 대상이었고, 실제 재실행으로 **2건 EXACT 신규 승격**(둘 다 카카오 키워드 검색 성공). 지시서의 다른 두 예시("광주시문화예술의전당 맹사성홀", "강진 다산박물관 2층 다목적홀")는 텍스트 정규화 자체는 정확히 의도대로 동작함을 직접 디버그 스크립트로 확인했으나(각각 "광주시문화예술의전당"/"강진 다산박물관"으로 정확히 축약), 카카오 키워드 검색이 동명이지만 실제로는 전라남도(영광문화예술의전당/강진 다산박물관 원조)의 장소로 오매칭해, 기존 `GYEONGGI_BOUNDS` 안전장치가 이를 정확히 감지해 좌표 기록을 거부했다(추측 금지 원칙이 의도대로 작동한 것 — 코드 결함이 아니라 실제로 이 두 건은 이 방식으로는 안전하게 지오코딩할 수 없는 케이스). 남은 대상 10건 중 8건은 이렇게 정직하게 `UNKNOWN`/`CITY_APPROX` 상태 그대로 남았다(좌표를 지어내지 않음).
    - **검증**: `npx tsc --noEmit` 통과, `npm run test` 279/279 통과(신규 12건: get-home-feed.test.ts 2건, gg-culture-location-enrichment.test.mjs 7건, page.test.tsx 3건), `npm run build` 통과(`/events/today`, `/api/events/today` 라우트 정상 생성 확인).
  - **관련 파일**: `src/lib/home/get-home-feed.ts`(+test), `src/lib/geo/region-hierarchy.ts`(신규), `src/app/api/events/today/route.ts`(신규), `src/app/events/today/page.tsx`(신규, +test), `src/components/home/home-view.tsx`(+test), `scripts/ingest/adapters/gg-culture-location-enrichment.mjs`(+test).
