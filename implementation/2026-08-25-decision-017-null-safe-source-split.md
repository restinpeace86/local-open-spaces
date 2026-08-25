# Decision 017: 서울시 공공 API 원천 메타필드 무오염 전수 수집 / Paging Loop 전수 순회 / SVCID NULL 병합 / 파이프라인 정밀 로깅

## 구현 대상
- `project/decision-log.md`에 Decision 017 기록
- `SeoulYeyakAdapter`를 MAXCLASSNM(대분류) 기준 `open_spaces`(체육시설/공간시설)/`events`(문화체험/
  교육강좌) 분리 적재로 전면 재작성, `진료복지` 수집 범위 제외
- Null-safe 전수 적재(위치/요금/예약URL 등 미비해도 드롭 금지), 항목 단위 무중단 처리, 에러
  원인별 집계
- SVCID 중복 시 컬럼 단위 NULL 병합(배치 내 + 기존 DB 행 모두)
- `docs/pipeline-log.md` API별 상세 리포트(테이블별 건수/중복·병합/제외/에러 상세)
- 체육/공간시설 키즈 뱃지 및 강제 카테고리 매핑 오매핑 정화(코드 + 기존 DB 데이터 모두)

## 구현 일시
2026-08-25

## 변경 사항

### Decision 기록
- `project/decision-log.md`: Decision 017 추가. 사용자 지시 원문의 번호(017)를 그대로 채택 —
  직전 기록은 013이며 014~016은 본 문서에 없다(비고로 명시).

### DB 스키마 마이그레이션
- `scripts/migrations/2026-08-25-decision-017-null-safe-source-schema.sql`(적용 완료):
  - `events`/`open_spaces`에 `source` 컬럼 추가(원천 식별, 예: `seoul_public_reservation`)
  - `events`에 `raw_data` jsonb 추가(open_spaces는 기존에 이미 있었음 — 동일 패턴 적용)
  - `open_spaces.location`의 `NOT NULL` 해제 + `location_precision` 컬럼/CHECK 제약 추가
    (Decision 009가 events에 도입한 EXACT/CITY_APPROX/UNKNOWN 패턴을 open_spaces에도 동일 적용)
  - `get_nearby_spaces_and_events` RPC의 `open_spaces` 분기에 `location_precision = 'EXACT'`
    필터 추가(events 분기와 동일 — 근사/미상 좌표가 지도에 정확한 위치처럼 노출되지 않도록)
- 실측으로 확인된 라이브 스키마(`information_schema.columns` 직접 조회)를 기준으로 작성 —
  마이그레이션 파일 목록만으로 추측하지 않고 실제 DB 상태를 먼저 확인함.

### 어댑터/파이프라인 코드
- `scripts/ingest/adapters/lib/schema-mapper.mjs`: `buildOpenSpaceRow`에 `locationPrecision`/
  `source` 지원 추가(좌표 없어도 `UNKNOWN`으로 드롭 없이 적재), `buildEventRow`에 `source`/
  `rawData` 지원 추가. 기본값(`locationPrecision: 'EXACT'`)은 기존 호출부와 동일하게 동작해
  기존 ~24개 어댑터에 영향 없음.
- `scripts/ingest/lib/ai-tagging.mjs`: `deriveSpaceKidsFriendly({ useTargetInfo, minClassName })`
  신설 — USETGTINFO(유아/어린이/초등학생/가족)/MINCLASSNM(키즈/체험) 두 필드로만 판별(오매핑 정화).
- `scripts/ingest/lib/supabase-admin.mjs`:
  - `upsertRowsSafeMerge`의 배치 내 중복 제거를 "마지막 값 우선"에서 "컬럼별 NULL 병합"으로
    교체(`dedupeByExternalIdMergeNulls`), `duplicateWithinBatch`/`mergedWithExisting` 통계 반환.
  - **실측 버그 수정**: 기존 행 조회(`select().in('external_id', ids)`)를 upsert와 같은
    500건 단위로 보냈더니 실제 프로덕션 재수집(1282건) 중 `TypeError: fetch failed`가
    발생했다(GET 쿼리스트링이 너무 길어짐 — 400건은 성공, 500건은 실패함을 별도 스크립트로
    실측 확인). `SELECT_LOOKUP_BATCH_SIZE = 200`으로 조회만 더 잘게 쪼개도록 수정.
- `scripts/ingest/adapters/base-collector-adapter.mjs`: `targetTable: 'multi'` 모드 추가.
  `transformSplit()` opt-in 훅(반환: `{open_spaces, events, errorCounts, excludedCount}`)과
  `runMultiTableUpsert()`를 신설해 하나의 원본을 두 테이블에 나눠 `upsertRowsSafeMerge`로
  적재하고, `recordPipelineRun`에 `detail`로 상세 통계를 전달한다. 기존 단일 테이블 어댑터
  25종의 `run()`은 이 분기를 타지 않아 동작 변화 없음. `runServiceTransformFromRaw()`는 아직
  `multi` 모드를 지원하지 않아 명시적 에러를 던지도록 가드 추가.
- `scripts/ingest/lib/pipeline-log.mjs`: `recordPipelineRun`에 `detail` 파라미터 추가 시
  표 아래에 `<details>` 접이식 상세 리포트(테이블별 가져온/적재/중복/병합 건수, 범위 제외,
  원인별 에러)를 남긴다. `detail`을 넘기지 않는 기존 호출부는 영향 없음.
- `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`: 전면 재작성.
  - `targetTable: 'multi'`, `transformSplit()` 구현. `MAXCLASSNM`(체육시설/공간시설→
    `open_spaces`, 문화체험/교육강좌→`events`, 진료복지→수집 범위 제외) 기준으로 분류.
  - Paging Loop을 100건 → **1,000건 단위**로 변경(Decision 017 6항).
  - `getRawRows()`가 진료복지를 RAW 레이어에도 남기지 않도록 필터링(수집 범위 밖 데이터는
    "보존 대상 원천 데이터"가 아니라는 판단 — 결정 이유는 구현 기록 하단 특이사항 참고).
  - 좌표/요금/예약URL 등 미비 항목은 드롭하지 않고 NULL/`UNKNOWN` precision으로 적재.
    SVCID/SVCNM 부재, events의 날짜 파싱 실패, 알 수 없는 MAXCLASSNM만 진짜 skip 대상으로
    `errorCounts`에 원인별 집계(`MISSING_SVCID`/`MISSING_NAME`/`DATE_PARSE_FAIL`/
    `UNKNOWN_MAXCLASSNM`/`COORDINATE_PARSE_FAIL`/`UNEXPECTED_ERROR`).
  - 강제 카테고리 매핑 제거: 체육시설/공간시설은 UI 카테고리를 null(→ETC)로 남김(기존
    `체육시설→KIDS_ACTIVITY` 강제 매핑 삭제). 문화체험/교육강좌는 `EXPERIENCE_CLASS`로 통일
    (기존 5대 카테고리 라벨 "체험·클래스"와 문자 그대로 대응해 강제 매핑이 아님).
  - `open_spaces` 행의 `is_kids_friendly`는 `deriveSpaceKidsFriendly`(정밀 판별)로 교체.
    `events` 행은 기존과 동일하게 `deriveParentalTags`(원본 전체 텍스트 스캔) 유지.
  - `source: 'seoul_public_reservation'`, `rawData: item`(MAXCLASSNM/MINCLASSNM 등 원천
    메타필드 무손실 보존)을 양쪽 테이블 공통으로 부여.

### 기존(이미 수집된) DB 데이터 정화
- `scripts/migrations/2026-08-25-decision-017-purge-stale-seoul-yeyak-events.sql`(적용 완료):
  옛 DIV 기준으로 `events`에 잘못 적재돼 있던 `KIDS_ACTIVITY`(596건, 실제로는 체육시설)와
  `ETC`(610건, 옛 시설대관/진료 혼재 — events에 원본 분류가 보존돼 있지 않아 사후 구분 불가)를
  삭제. 사용자 확인(2026-08-25, "삭제 후 즉시 재수집") 하에 진행.
- `scripts/migrations/2026-08-25-decision-017-purge-stale-performance-festival.sql`(적용 완료,
  같은 날 실적용 도중 발견해 후속 조치): 첫 재수집 실행 후 `event_type = 'PERFORMANCE_FESTIVAL'`
  (1088건, 옛 DIV '문화행사' 강제 매핑 결과)이 `upsertRowsSafeMerge`의 COALESCE(existing,
  incoming) 시맨틱 때문에 새 값(`EXPERIENCE_CLASS`)으로 전혀 갱신되지 않고 영구 고정됨을
  실측으로 확인 — safe-merge는 "재파싱이 놓친 값 보존" 용도지 "의도적 재분류"에는 맞지 않는
  도구였다. 삭제 후 재수집해 새 코드가 `EXPERIENCE_CLASS`로 새로 삽입하도록 정정.
- 두 삭제 모두 원본 API가 살아있어 재수집으로 완전히 복구 가능함을 확인한 뒤 진행했다(데이터
  유실이 아니라 재정렬).

## 검증 결과 (실제 API/DB 호출)
- 신규/수정 테스트: `schema-mapper.test.mjs`(6, 신규), `ai-tagging.test.mjs`(4, 신규),
  `supabase-admin.test.mjs`(중복 제거/select 배치 크기 관련 신규 3건 포함 21개), `pipeline-log.
  test.mjs`(detail 블록 2건 포함 5개), `base-collector-adapter.test.mjs`('multi' 모드 6건 포함
  13개), `seoul-yeyak-adapter.test.mjs`(MAXCLASSNM 기준 전면 재작성, 30개) — 전체 통과.
- `npx tsc --noEmit` / `npm run test`(36 파일 384건) / `npm run build`: 모두 통과.
- **`--dry-run` 실측**: 2,906건 수신 → `open_spaces` 1,282건 / `events` 1,595건 / 범위 제외
  (진료복지) 29건 / 에러(비드롭성 `COORDINATE_PARSE_FAIL`) 15건. 1282+1595+29 = 2906 —
  드롭 없는 100% 전수 처리를 정확히 확인.
- **실제 프로덕션 재수집**: 위와 동일한 건수로 실제 DB에 upsert 완료. 좌표 없는 64건이
  `location_precision = 'UNKNOWN'`으로 드롭 없이 적재됨을 DB 쿼리로 직접 확인.
- **실측 중 발견해 그 자리에서 수정한 버그 2건**(둘 다 위 "변경 사항"에 상세):
  1. `select().in()` 500건 배치가 "fetch failed"로 실패 → 200건 단위로 재조정.
  2. safe-merge의 COALESCE 시맨틱이 의도적 재분류(PERFORMANCE_FESTIVAL→EXPERIENCE_CLASS)를
     막아버림 → 해당 스테일 행 삭제 후 재수집으로 정정.
- 정화 후 `SELECT event_type, COUNT(*) FROM events WHERE external_id LIKE 'SEOUL_YEYAK_%' GROUP
  BY event_type`: `EXPERIENCE_CLASS`만 남음(1,627건) — KIDS_ACTIVITY/ETC/PERFORMANCE_FESTIVAL
  전부 정화 확인.

## 특이 사항
- **사용자 지시 원문과 실측 API 필드명 불일치**: Decision 017 지시문은 접수기간 필드를
  `RCEPTBGNDE/ENDDE`로 표기했으나, 실제 API 응답 및 기존에 이미 검증된 코드는 `RCPTBGNDT`/
  `RCPTENDDT`를 쓴다(스펠링·DT/DE 모두 다름). 이번 `--dry-run`/실제 수집 양쪽에서 실측
  재확인했고, 임의로 코드를 지시문 표기에 맞춰 바꾸지 않고 검증된 실제 필드명을 그대로
  유지했다(제3장 제5조 추측 금지 — 없는 필드명으로 바꾸면 오히려 회귀가 됨). 어차피
  `raw_data`에 원본 객체 전체를 보존하므로 필드명 표기 차이와 무관하게 "원천 메타필드 보존"
  요구사항 자체는 충족된다.
- **"spaces" 테이블 명칭**: 사용자 지시문은 "spaces" 테이블을 언급했으나 실제 프로젝트에는
  `open_spaces`만 존재한다(Decision 017 본문에 이 해석을 명시). 신규 테이블을 만들지 않고
  기존 스키마를 그대로 사용했다.
- **적용 범위**: 이번에 `MAXCLASSNM` 기반 분리 적재를 실제로 마이그레이션한 어댑터는
  `SeoulYeyakAdapter` 1건뿐이다. `BaseCollectorAdapter`의 `targetTable: 'multi'` 인프라는
  범용이라 향후 유사한 다중 성격 원본에도 재사용 가능하지만, 이번 작업 범위는 사용자 지시가
  명시한 서울시 통합 예약 API에 한정했다.
- **`runServiceTransformFromRaw()`는 아직 'multi' 모드를 지원하지 않는다** — 호출 시 명시적
  에러를 던진다. 현재 파이프라인 어디에서도 이 메서드를 자동 호출하지 않으므로(수동 재가공
  유틸리티) 당장 영향은 없으나, 향후 RAW 레이어에서 SEOUL_YEYAK을 재가공해야 할 일이 생기면
  `transformSplit()` 기반 재가공 로직을 별도로 구현해야 한다.
- **`events` 테이블에 남아있는 일부 오래된 `SEOUL_YEYAK_*` 행**(이번 재수집 결과 1,595건보다
  실제 총계가 1,627건으로 32건 더 많음): 과거에 수집됐다가 현재 라이브 API 페이징 결과에는
  더 이상 나타나지 않는(예: 접수 종료 후 API 목록에서 사라진) 항목으로 추정된다. 이는 일반적인
  upsert 파이프라인에서 자연히 발생하는 소스 측 데이터 소멸이며 Decision 017의 요구 범위(신규
  수집/분류/병합/로깅) 밖이라 별도 정리하지 않았다 — 필요하면 별도 논의 후 진행.
