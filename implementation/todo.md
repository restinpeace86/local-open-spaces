- [x] **[Task 9-6-8] 전국 행정구역 광역 지자체(도/시) 접두사 자동 보완 파이프라인 및 DB 정규화** 🧭 (2026-08-23 완료)
  - **작업 목표**: `sigungu_name` 또는 지역 필드에 광역 지자체(도/특별시/광역시)가 누락된 경우(예: '과천시', '성남시 분당구') 전국 시군구 매핑 룩업을 통해 '경기도 과천시', '경기도 성남시 분당구' 형태로 자동 표준화.
  - **세부 작업 지시**:
    1. **전국 기초-광역 지자체 룩업 헬퍼 구축 (`src/lib/region/korea-regions.ts` 또는 유사 모듈)**:
       - 전국 시/군/구 명칭 입력 시 대응하는 광역지자체(경기도, 서울특별시, 인천광역시, 강원특별자치도 등)를 반환하는 매핑 함수 구현.
    2. **수집 어댑터 정규화 로직 적용**:
       - 수집 및 스크래핑 파이프라인에서 장소/이벤트 저장 시 광역 명칭 누락 여부를 체크하여 표준 형태(`[광역] [기초]`)로 적재되도록 보완.
    3. **기존 DB 정문화 마이그레이션**:
       - DB 내 접두사가 빠진 기존 레코드들을 룩업 테이블 기반으로 조회하여 `경기도 과천시`, `경기도 성남시` 형태로 일괄 UPDATE.
    4. **카드 및 피드 UI 실측 검증**:
       - 메인 홈 카드, `/events/today` 리스트, 검색 결과에서 '경기도 과천시'처럼 깔끔하고 통일된 행정구역이 노출되는지 실측 검증.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 라이브 카드 UI 및 DB 조회 시 접두사 빠진 단독 시/군/구 표기 0건 실측 확인.

  - **실측 규모**: 라이브 DB 전수 조사(events 174개/open_spaces 338개, 총 342개 고유 sigungu_name) 결과 265개(77%)가 광역 접두 없이 저장돼 있었음 — 이 프로젝트가 실제로는 경기도/서울 위주가 아니라 전국 단위 데이터(한국관광공사 TourAPI 등)를 폭넓게 다루고 있음을 재확인. 지시서의 "룩업 헬퍼"는 예시(과천시/분당구) 수준이 아니라 실제로 전국 커버리지가 필요했다.
  - **(1) 룩업 헬퍼**: `scripts/ingest/adapters/lib/korea-region-lookup.mjs`(인제스트 스크립트용) + `src/lib/geo/korea-region-lookup.ts`(Next.js 앱용, 동일 내용의 별도 런타임 미러 — 기존 GYEONGGI_SIGUN_NAMES/SEOUL_GU_NAMES와 동일한 관례) 신규 작성. `SIGUN_TO_PROVINCE`(전국 시/군/구 206개 → 광역 지자체, 대한민국 공식 명칭 기준 — 2023-07 군위군 대구 편입, 2024-01 전라북도→전북특별자치도, 2023-06 강원도→강원특별자치도, 2026-07 인천 제물포구/영종구/검단구/서해구 신설, 2026-02 화성시 4개 구 신설 등 최신 개편을 실측 웹 검색으로 반영)와 `ORPHANED_SUBDISTRICT_FULL_PATH`(상위 "시" 토큰 없이 구만 단독 저장된 경우, 예: "영통구"→"경기도 수원시 영통구") 2단 구조. 여러 광역에 동일 이름이 존재해 이름만으로 판별 불가능한 값(남구/북구/동구/서구/중구/강서구/고성군/광주시 단독)은 의도적으로 표에서 제외해 추측하지 않는다.
  - **(2) 수집 어댑터 보완**: 개별 어댑터를 일일이 고치는 대신 `schema-mapper.mjs`의 `buildEventRow`/`buildOpenSpaceRow`(모든 어댑터가 공용으로 쓰는 최종 스키마 빌더) 딱 두 곳에 `normalizeSigunguProvince()`를 끼워 넣어, 기존 어댑터 15개 이상을 건드리지 않고 한 번에 전부 적용했다(제5장 제4조, Task 9-6-7과 동일한 "단일 지점 수정" 전략). Task 9-6-7에서 고친 seoul-yeyak-adapter.mjs의 "서울시 아님" 케이스(예: 과천시)도 이 단계에서 자동으로 "경기도 과천시"가 되어 두 태스크의 수정이 자연스럽게 합류함을 테스트로 확인.
  - **(3) 기존 DB 정규화 마이그레이션**: `scripts/migrations/2026-08-23-normalize-sigungu-province-prefix.sql` 생성(고유값 기준 시/군/구당 UPDATE 1건 — 변환이 결정적이라 ID별 업데이트보다 훨씬 효율적) 후 `apply-sql.mjs`로 실행. **실측 결과**: events 122건, open_spaces 245건, 총 367개 고유 변환으로 **86,446행**(events 1,720 + open_spaces 84,726) 정정 완료. 마이그레이션 후 재조회로 두 테이블 전체에 정규화 필요한 값 0건 확인.
  - **(4) 방어적 표시 계층**: `src/lib/spaces/format.ts`의 `formatVenueLine`(모든 카드 공용)에도 `normalizeSigunguProvince`를 적용해, 인제스트/마이그레이션이 놓친 값이 있어도 화면 표시 시점에 한 번 더 보완되도록 이중 방어했다.
  - **UI 실측 검증**: 개발 서버 기동 후 `/api/home/feed`(메인 홈, 30건)와 `/api/events/today`(41건) 실제 응답을 정규식으로 전수 검사 — 접두 없는 sigungu_name 카드 0건, 샘플 "경기도 과천시"/"경기도 포천시" 등 정상 표기 확인.
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 307/307 통과(korea-region-lookup 테스트 18건 신규, 기존 어댑터/컴포넌트 테스트 중 새 정규화로 결과가 바뀐 4건 갱신), `npm run build` 통과.
  - **관련 파일**: `scripts/ingest/adapters/lib/korea-region-lookup.mjs`(신규, +test), `src/lib/geo/korea-region-lookup.ts`(신규, +test), `scripts/ingest/adapters/lib/schema-mapper.mjs`, `src/lib/spaces/format.ts`(+test), `scripts/migrations/2026-08-23-normalize-sigungu-province-prefix.sql`(신규), `scripts/ingest/adapters/seoul-yeyak-adapter.test.mjs`, `scripts/ingest/adapters/gg-culture-events-adapter.test.mjs`, `src/components/home/home-view.test.tsx`.
