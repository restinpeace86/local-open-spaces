- [x] [강제 리셋 및 복구] Git 로컬 변경사항 초기화 후 E2E 테스트 및 빌드 수복
  - `git fetch origin` 결과 로컬 `main`은 이미 `origin/main`(127f849)과 동일 커밋이었으며, `git reset --hard`는 수행하지 않음.
    로컬에 남아있던 미커밋 변경(`kakao-map-view.tsx` 등)을 검토한 결과 "깨진 코드"가 아니라 이미 이번 작업이 요구하는
    수정(단일 반경 pinch/wheel 줌 시 이전 레벨로 강제 복귀시키던 `MAX_SINGLE_RADIUS_METERS`/`handleZoomChanged` 로직 제거)이
    선반영된 상태였음. 해당 로직은 `spec/common/search.md` 2.2에 정의되지 않은 임의 비즈니스 로직(제7장 제3조 위반)이었으므로
    제거가 맞는 방향이며, `git reset --hard`로 되돌리는 것은 오히려 스펙 위반 상태로 회귀시키는 것이라 판단해 보존함.
  - `map-explorer.tsx`에 남아있던 이제는 존재하지 않는 `KakaoMapView`의 `onZoomExceedsMaxRadius` prop 참조를 제거하여 타입 정합성 복구.
  - `tests/e2e/core-scenarios.spec.ts` 내에는 애초에 pinch/wheel 줌 초과 팝업을 검증하는 테스트가 없었음(20km/30km 반경 버튼 잠금 팝업 테스트만 존재하며 이는 별개 기능이고 정상 통과). 별도 업데이트 불필요.
  - 저장소 루트에 남아있던 이전 세션의 손상된 디스코드 알림 스크립트 리다이렉트 잔여물(커밋 해시 이름의 71바이트 쓰레기 파일 12개)을 정리함.
  - 검증: `npx tsc --noEmit` 통과, `npm run test`(vitest) 2/2 통과, `npm run build` 성공, `npx playwright test` 6/6 통과.

## Decision 008 — 명세서 통합 정리 (2026-08-22)

- [x] `docs/spec.md`(가성비 놀거리 서비스 SSOT)와 기존 `project/`, `spec/` 문서 간 충돌 항목 매핑 및 정리
  - `project/decision-log.md`에 Decision 008 신규 기록
  - `project/overview.md`, `project/architecture.md`, `project/data_sources.md`: 서비스 정의/탐색흐름/데이터소스를 새 방향으로 갱신하되 기존 Zero-Cost·PostGIS·반응형 기술 세부는 유지
  - `spec/data/ai-rule.md`: 3.3에 "DB 원본 카테고리 → 5대 UI 카테고리" 매핑 신설(코드 미반영 상태로 명시), `is_free` 오탐 방지 Fallback 규칙 추가
  - `spec/common/search.md`: 중복된 20km/30km 안내 섹션 통합, 카테고리 목록을 5대 UI 카테고리로 갱신
  - `spec/space/space-card.md`, `spec/event/event-card.md`: Parental Checkpoint 뱃지를 `docs/spec.md` 4대 핵심 뱃지 기준으로 재정렬(주차/유모차는 보조 뱃지로 유지)
  - `spec/common/feature-flags.md`: 깨져있던 코드펜스 문법 오류 수정
- [x] **[코드] DB 카테고리 → 5대 UI 카테고리 매핑 반영** (`implementation/2026-08-22-collector-adapter-architecture.md`) — `category-meta.ts`에 5대 UI 카테고리 색상/라벨 추가, `scripts/ingest/adapters/lib/schema-mapper.mjs`가 신규 수집 데이터에 실제 매핑 적용. DB 원본 `category`/`event_type` 값 컬럼 자체는 변경 없이 같은 컬럼에 신규/기존 값이 공존(RPC 실호출로 확인)
- [x] **[코드] 수집 파이프라인 어댑터 아키텍처** (`scripts/ingest/adapters/`, `implementation/2026-08-22-collector-adapter-architecture.md`) — `BaseCollectorAdapter` 추상 클래스 + `SeoulYeyakAdapter`(기존 스크립트 이관, 2,527건 실제 upsert 검증)/`LocalDataKidsAdapter`(구조 완성, 실제 CSV URL 없어 실행 미검증) 구현
- [~] **`LOCAL_DATA_KIDS_CSV_URL` 실제 값 확보 후 재검증** — localdata.go.kr에서 대상 업종(기타유원시설업 등)의 CSV 다운로드 URL을 사용자가 확인해 `.env.local`에 추가해야 진행 가능 → 값이 채워지면 `npm run ingest:local-data-kids -- --dry-run`으로 컬럼명 매핑 검증
- [~] **나머지 5개 신규 소스 어댑터** (TOURA_4_0 contentTypeId 12/14/15 세분화, SEOUL_KIDS_CAFE, NONGSARO_FARM, GG_WATER_PLAY, NAVER_LOCAL_SEARCH) — `BaseCollectorAdapter` 패턴으로 후속 구현 가능. SEOUL_KIDS_CAFE는 기존 `SEOUL_OPEN_DATA_KEY` 재사용 가능해 보이나 정확한 데이터셋/서비스명 미확인, 나머지는 신규 API 키 발급 필요

## 신규 데이터 소스 backlog (2026-08-22, 사용자 제공 15개+ 목록 — 상세는 `project/data_sources.md` 2.3)

- [x] **[코드] NationalParkEcotourAdapter** (`implementation/2026-08-22-national-park-ecotour-adapter.md`) — 국립공원공단_국립공원 생태관광정보 DB(odcloud.kr), Swagger로 스펙 확인 후 실제 호출 성공(110건). `open_spaces`(category=EXPERIENCE_CLASS) 매핑까지 구현
- [~] **`KAKAO_REST_API_KEY` 확보 후 재검증** — 원본에 좌표가 없어 Kakao 지오코딩 필수. 이미 보유한 JS 지도 키(`NEXT_PUBLIC_KAKAO_MAP_API_KEY`, 도메인 제한)로는 REST 호출이 401로 실패함을 확인함 — Kakao Developers [앱 키] 탭의 "REST API 키"가 별도로 필요. 값이 채워지면 `npm run ingest:national-park-ecotour -- --dry-run`으로 재검증
- [~] 1. 물놀이터·바닥분수(경기/서울) — 단일 API 부재로 보류, 수동 확인 필요 (`data_sources.md` 참고)
- [~] 2. 서울형 키즈카페(OA-21716) — 정확한 서비스명 AJAX 렌더링으로 자동 조사 불가, 사용자 확인 대기
- [ ] 3~7번(수영장/숲체험 나머지/농촌체험/스케이트장/박물관·과학관 등) — 아직 미착수, `project/data_sources.md` 2.3 표 순서대로 진행 예정
- [x] **한국관광공사_반려동물 동반여행 서비스** (`KorPetTourService2`, B551011) — `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 원인 규명 완료. `reference/개방데이터_활용매뉴얼(반려동물동반여행)/한국관광공사_개방데이터_활용신청방법_매뉴얼_v3.3.docx`(공식 문서, docx→XML 직접 파싱으로 확인) 58행: "개발계정은 자동승인으로 활용 신청 후, 약 10분~30분 이후에 사용이 가능합니다." — 추측이 아니라 공식 매뉴얼에 명시된 활성화 지연이었음. 시간 경과 후 재호출 시 `areaCode2`(지역코드 17건 정상 응답), `areaBasedList2`(서울 관광지 55건, 좌표 포함 정상 응답) 모두 `resultCode: 0000 OK` 확인
  - [x] **[코드] KorPetTourAdapter** (`scripts/ingest/adapters/kor-pet-tour-adapter.mjs`) — 사용자 확인(2026-08-20): `contentTypeId` 12(관광지)/14(문화시설)/28(레포츠)만 수집(숙박/음식점/쇼핑/축제공연행사는 스코프 밖으로 제외). `open_spaces` 테이블에 매핑(12→OUTDOOR_NATURE, 14→EXHIBITION_MUSEUM, 28→KIDS_ACTIVITY). 실제 호출 857건 upsert 완료 검증(`npm run ingest:kor-pet-tour`)
- [x] **한국관광공사_무장애 여행 정보 서비스** (`KorWithService2`, B551011) — 사용자가 인증키/엔드포인트 전달, 즉시 실제 호출 검증(활성화 지연 없이 바로 `resultCode: 0000`). `KorPetTourAdapter`와 응답 스키마가 동일해 공통 베이스 `TourApiV4AreaBasedAdapter`(`scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`)로 추출 후 `KorPetTourAdapter`도 리팩터링(회귀 검증: 857건 동일하게 재확인). `KorWithTourAdapter`도 동일 스코프(contentTypeId 12/14/28) 적용, 실제 5,040건 upsert 완료 검증(`npm run ingest:kor-with-tour`)
  - [ ] (향후 확장 아이디어, 미착수) `detailWithTour2` 오퍼레이션이 휠체어/유모차 대여·수유실 등 실제 무장애 편의시설 정보를 제공해 기존 `has_parking`/`stroller_accessible` 컬럼과 정확히 매핑 가능함을 실제 호출로 확인했으나, 해당 오퍼레이션도 일일 1,000건 트래픽 제한이 있어 5,040건 전체에 대해 건별 상세 조회 시 한도 초과 — 현재는 호출하지 않음(Zero-Cost 원칙, MVP 범위 초과 방지). 필요 시 별도 배치/일부 표본 전략 설계 후 진행
- [x] **한국관광공사_고캠핑 정보 서비스** (`GoCamping`, B551011) — 사용자가 인증키/엔드포인트 전달, 즉시 실제 호출 검증(`resultCode: 0000`, 총 3,097건). TourAPI 4.0 계열과 응답 필드명 체계가 달라(`contentId`/`facltNm`/`mapX` 등) 별도 어댑터(`scripts/ingest/adapters/go-camping-adapter.mjs`)로 구현. 캠핑장은 정의상 전부 야외 시설이라 별도 스코프 확인 없이 전체를 OUTDOOR_NATURE로 매핑(카테고리 분기 불필요), 실제 3,087건 upsert 완료 검증(`npm run ingest:go-camping`)
  - [ ] (향후 확장 아이디어, 미착수) 원본에 `sbrsCl`(편의시설: 전기/물놀이장/놀이터 등), `posblFcltyCl`(가능시설: 어린이놀이시설 등), `animalCmgCl`(반려동물 동반가능) 등 풍부한 정형 필드가 있어 `is_kids_friendly`/`has_parking` 등 컬럼을 규칙 기반으로 채울 여지가 있으나, 값 종류가 많고 조합이 다양해 임의로 매핑 규칙을 만들지 않음(추측 금지) — 필요 시 정확한 매핑표를 사용자/Spec으로 확정 후 진행
- [~] **[코드] 하단 5탭 내비게이션 + 홈 화면 신규 구현** — `docs/spec.md` 2 기준. 현재 상단 3탭(지도/도감/캘린더) 구조를 대체하는 것이 아니라 그 기능들을 [내주변]/[카테고리] 탭 안으로 재배치. 홈 캐러셀/서브탭(특가·핫딜/무료·공공)/큐레이션 피드는 신규 UI 컴포넌트 필요. **범위가 커서 화면 목업/우선순위를 먼저 사용자와 확정한 뒤 착수 — 확정되면 이 표시를 빈 대괄호로 바꿔 자동 루프가 집을 수 있게 할 것**
- [~] **[코드] 커머스 핫딜 API 연동(쿠팡 파트너스/네이버 쇼핑)** — 신규 API 키/제휴 계약이 있어야 착수 가능 (Claude가 스스로 발급/체결 불가)
- [ ] **[코드] 요금 오탐 방지 Fallback 룰(비-OCR 부분) 구현** — `spec/data/ai-rule.md` 5.2-7의 "요금 미기재 국공립 시설 → `is_free: true` 기본 추정" 로직만 우선 반영 (기존 ingest 스크립트에 조건 추가 수준으로 착수 가능)
- [~] **[코드] 요금 포스터 이미지 OCR 파싱** — 비전 API(Gemini Vision 등) 연동 및 비용/키 확인 필요
