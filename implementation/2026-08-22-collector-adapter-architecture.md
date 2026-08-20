# 수집 파이프라인 어댑터 아키텍처 구현 (BaseCollectorAdapter)

## 구현 대상
- 사용자가 전달한 [Data Source Spec](7개 신규 소스 목록)을 통합 관리할 어댑터 구조
- `BaseCollectorAdapter` 추상 클래스 (`fetch()`/`transform()` 필수)
- 구체 구현 2종: `SeoulYeyakAdapter`(Outlink URL 생성), `LocalDataKidsAdapter`(CSV + 영업상태 필터링)
- 5대 카테고리/4대 뱃지 매핑 연결부 인터페이스

## 구현 일시
2026-08-22

## 변경 사항

### 공통 아키텍처
- `scripts/ingest/adapters/base-collector-adapter.mjs`: 추상 베이스 클래스. `fetch()`/`transform()`은 서브클래스 필수 구현(미구현 시 명시적 에러), `run({dryRun})`이 fetch→transform→검증로그→upsert를 공통 오케스트레이션
- `scripts/ingest/adapters/lib/schema-mapper.mjs`: `UI_CATEGORY`(5대 카테고리 enum) + `buildOpenSpaceRow`/`buildEventRow`(표준 스키마 행 빌더) + 가성비/실내외 뱃지 정규화 헬퍼. `spec/data/ai-rule.md` 4.1 원칙에 따라 매핑 불가 카테고리는 임의로 끼워 맞추지 않고 `null`(ETC 처리) 반환
- `scripts/ingest/adapters/lib/csv-parser.mjs`: 의존성 추가 없이 자체 구현한 최소 CSV 파서 (따옴표 필드 내 콤마/개행 처리)
- `scripts/ingest/adapters/lib/epsg5174.mjs`: `proj4` 신규 설치(좌표 변환은 직접 구현 시 오류 위험이 커 검증된 라이브러리 사용). LocalData 인허가 데이터의 EPSG:5174 투영좌표 → WGS84 변환. 왕복 변환(서울시청 좌표 기준)으로 수학적 정합성 검증

### SeoulYeyakAdapter
- 기존 `scripts/ingest/seoul-public-reservation.mjs`(tvYeyakCOllect 기반, 이미 실제 검증된 로직)를 어댑터 클래스로 이관 — **중복 구현 대신 기존 검증된 로직을 재사용** (제4조)
- SVCID로부터 예약 Outlink URL을 직접 구성(`https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id={SVCID}`), API의 SVCURL 필드에 의존하지 않도록 함
- DIV(문화행사/체육시설/교육/시설대관/진료) → 5대 UI 카테고리 매핑. "진료"처럼 놀거리 도메인과 무관한 분류는 강제 매핑하지 않고 null(ETC) 처리
- 기존 `scripts/ingest/seoul-public-reservation.mjs`는 어댑터를 호출하는 얇은 CLI 진입점으로 축소

### LocalDataKidsAdapter
- CSV URL을 `LOCAL_DATA_KIDS_CSV_URL` 환경변수로 받음 — **실제 URL을 추측하지 않음** (localdata.go.kr은 업종별 개별 URL 발급, 제3장 제5조 추측 금지)
- 영업상태 컬럼에서 '영업/정상'만 필터링(폐업/휴업 제외), EPSG:5174 좌표 변환, 카테고리는 `KIDS_ACTIVITY` 고정
- 신규 CLI 진입점 `scripts/ingest/local-data-kids.mjs` + `package.json`에 `ingest:local-data-kids` 스크립트 추가

### 프론트엔드 연동
- `src/lib/spaces/category-meta.ts`: 5대 UI 카테고리(`EXPERIENCE_CLASS`/`OUTDOOR_NATURE`/`EXHIBITION_MUSEUM`/`PERFORMANCE_FESTIVAL`/`KIDS_ACTIVITY`) 색상/라벨 추가 — 기존 세부 카테고리와 같은 컬럼에 공존하며 지도 마커/리스트/상세 모달 어디서든 정상 렌더링됨

## 검증 결과 (실제 API/DB 호출)
- **중요 발견**: `events` 테이블 upsert 시도 중 `Could not find the 'category' column of 'events'` 오류 발생 → `project/database_schema.md`가 실제 라이브 DB와 어긋나 있었음(문서에는 `events.category`/`events.source_type`이 있는 것으로 기재되어 있었으나 실제로는 없음). `information_schema.columns` 직접 조회로 실제 스키마 확인 후 `schema-mapper.mjs`와 `database_schema.md` 양쪽을 실제 스키마 기준으로 정정
- `node scripts/ingest/seoul-public-reservation.mjs --dry-run`: 2,632건 원본 수신, 2,527건 표준 스키마 변환 확인
- `node scripts/ingest/seoul-public-reservation.mjs` (실행): `events` 테이블에 실제 2,527건 upsert 성공
- RPC 검증: 서울시청 인근 반경 3km 조회 시 신규 5대 카테고리(`PERFORMANCE_FESTIVAL`, `EXPERIENCE_CLASS`, `KIDS_ACTIVITY`)와 기존 세부 카테고리(`CULTURE`, `RESERVATION`, `FESTIVAL`)가 같은 응답에 정상 공존하는 것 확인. 예약 Outlink URL이 SVCID로부터 정확히 구성됨을 확인
- `node scripts/ingest/local-data-kids.mjs --dry-run`: CSV URL 미설정 시 명확한 에러 메시지로 정상 종료(exit 1) 확인 — **실제 CSV 데이터로는 검증 불가** (사용자가 localdata.go.kr에서 실제 URL 확인 후 `.env.local`에 `LOCAL_DATA_KIDS_CSV_URL` 추가 필요)
- EPSG:5174 좌표 변환: 서울시청 좌표 기준 WGS84→5174→WGS84 왕복 변환으로 수학적 정합성 확인 (외부 실측값 대조는 실제 CSV 데이터 확보 전까지 불가)
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build` / `npx playwright test`(6/6): 모두 통과

## 특이 사항
- **`LocalDataKidsAdapter`는 구조적으로 완성됐으나 실행 미검증 상태**: 실제 CSV URL이 없어 컬럼명 후보 목록(`COLUMN_CANDIDATES`)이 실제 응답과 정확히 일치하는지 확인하지 못함. localdata.go.kr 표준 컬럼명(사업장명/도로명전체주소/영업상태명/좌표정보x·y(epsg5174))을 기준으로 작성했으나, 실제 URL 확보 후 반드시 `--dry-run`으로 재검증 필요
- **TourAPI(contentTypeId 12/14/15) 및 나머지 4개 신규 소스**(SEOUL_KIDS_CAFE, NONGSARO_FARM, GG_WATER_PLAY, NAVER_LOCAL_SEARCH)의 어댑터는 이번 범위에 포함하지 않음 — 사용자가 명시적으로 "SeoulYeyakAdapter와 LocalDataKidsAdapter 2개"로 범위를 한정했기 때문. 나머지는 동일 `BaseCollectorAdapter` 패턴으로 후속 구현 가능
- `events` 테이블에 새로 생성되는 행의 `category`는 별도 컬럼이 아닌 `event_type` 컬럼에 저장됨 (스키마 실측 결과 반영) — `spec/data/ai-rule.md` 3.3의 매핑 대상도 이 컬럼임을 함께 정정
