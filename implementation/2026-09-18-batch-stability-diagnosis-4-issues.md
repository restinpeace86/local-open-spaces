# [백엔드 배치 안정성 이슈 4가지 진단 및 수정]

## 구현 대상
`implementation/todo.md` [개선사항 2] — GG_CULTURE_EVENTS/SEOUL_CULTURE_EVENTS 파싱
에러(312건/538건)와 MATCH_EVENTS_TO_OPEN_SPACES/REFRESH_EVENTS_FILTER_OPTIONS_CACHE
타임아웃 4가지에 대한 원인 분석 + 즉시 적용 가능한 해결 코드.

## 구현 일시
2026-09-18

## 진단 및 조치 (전부 실측 기반, 추측 없음)

### 이슈 1: GG_CULTURE_EVENTS 파싱 에러 312건
**원인(코드 실측)**: `gg-culture-events-adapter.mjs`의 두 하위 변환 함수가 다음 조건에서
행을 조용히 드롭한다 — API1(문화행사): 제목/시작일/종료일 누락. API2(문화재단 행사):
제목/시작일/종료일 누락, LOC_NM(장소) 비어있음, 지오코딩 실패(2단계 재시도 후에도).
기존에는 `errorCount = rawCount - count`라는 단일 숫자만 남아 정확히 어떤 조건이
얼마나 기여했는지 알 수 없었다.

**조치**: `transform()`이 반환하는 배열에 `errorCounts`(원인별 집계) 프로퍼티를 얹어
`pipeline_logs.meta_data.errorCounts`로 흘러가게 했다 — 다음 실행부터 관리자가 정확한
원인별 건수(MISSING_TITLE_OR_DATE/EMPTY_LOC_NM/GEOCODE_FAILED/UNEXPECTED_ERROR)를 볼
수 있다. seoul-yeyak-adapter.mjs가 이미 쓰던 `bumpError` 헬퍼를
`scripts/ingest/lib/error-counts.mjs`로 공용화해 재사용했다(제5장 제4조).

### 이슈 2: SEOUL_CULTURE_EVENTS 파싱 에러 538건
**원인(코드 실측)**: `seoul-culture-events.mjs`의 `mapToEventRow`가 좌표(LAT/LOT)·
STRTDATE·END_DATE·TITLE 중 하나라도 없으면 null을 반환해 드롭한다. 역시 원인별
구분이 없었다.

**조치**: 동일 조건을 원인별로 재검사하는 `diagnoseDropReason()` 순수 함수를 추가하고
(판정 자체는 `mapToEventRow` 하나가 유일한 소스), `run()`에서 드롭된 건만 집계해
`errorCounts`(MISSING_TITLE/MISSING_STRTDATE/MISSING_END_DATE/
MISSING_OR_INVALID_COORDS)로 반환값에 포함시켰다.

### 이슈 3: MATCH_EVENTS_TO_OPEN_SPACES 타임아웃
**원인(EXPLAIN 실측, 가설이었던 "인덱스 누락/카테시안 곱"은 틀림)**: `idx_open_spaces_
location_geography`/`events_pkey` 인덱스 둘 다 정상적으로 쓰이고 있었다(Nested Loop +
Parallel Index Scan). 진짜 병목은 2026-09-12 RPC 도입 이후 "space_id가 NULL인 이벤트"가
매일 누적돼(애초에 매칭될 스팟이 없는 오래된 이벤트도 계속 남음) 매일 전체를 재스캔하며
이벤트당 open_spaces 프로브를 반복하는 Nested Loop 반복 횟수가 계속 커진 것이었다.

**조치**: `match_events_to_open_spaces(p_since_days integer default 3)`로 파라미터를
추가해 기본적으로 최근 3일 이내 생성된 이벤트만 대상으로 좁혔다(이 기능의 원래 목적
자체가 "이번에 새로 들어온 이벤트 자동 연결"이라 과거 전체를 매일 재스캔할 필요가
없음). 방어적으로 함수 자체에 `set statement_timeout = '60s'`도 추가했다. 필요하면
`client.rpc('match_events_to_open_spaces', { p_since_days: null })`로 과거 전체를
다시 훑을 수 있다(기존 동작을 완전히 없애지 않음).

### 이슈 4: REFRESH_EVENTS_FILTER_OPTIONS_CACHE 타임아웃
**원인(실측: Supabase CLI로 REFRESH를 직접 실행해 소요 시간 측정)**: 약 18초 소요.
DB 서버 자체의 statement_timeout(120초, `pg_settings` 실측 확인)보다는 훨씬 짧지만,
`run-daily.mjs`가 실제로 호출하는 PostgREST RPC 경로에서는 이보다 훨씬 짧은 타임아웃에
걸린다(`pipeline_logs`에 반복 재현된 실측 로그로 확인). `pg_roles.rolconfig`에는
`service_role` 자체의 오버라이드가 없어(anon 3초/authenticated 8초와 달리 null) 정확한
주입 경로는 특정하지 못했지만, 함수 정의에 `set statement_timeout`을 걸면 그 함수
실행 동안은 세션이 무엇을 상속했든 이 값이 확실히 우선 적용된다(PostgreSQL 표준 기능).

**조치**: `refresh_events_filter_options_cache()`에 `set statement_timeout = '60s'`를
추가했다.

## 실측 검증 (실제 프로덕션 DB에 적용 후 확인)
- `scripts/migrations/2026-09-18-fix-match-events-and-filter-cache-timeouts.sql`을
  Supabase CLI(`npx supabase db query --linked`)로 라이브 DB에 직접 적용.
- 적용 직후 `client.rpc('match_events_to_open_spaces')`를 실제 PostgREST 경로로 호출
  → 4.5초, 59건 매칭 성공(과거엔 이 경로에서 반복적으로 timeout).
- `client.rpc('refresh_events_filter_options_cache')` → 1.7초 성공.
- 첫 시도에서 `create or replace function ...(p_since_days integer default 3)`이
  기존 무인자 버전과 시그니처가 달라 PostgREST가 "Could not choose the best candidate
  function" 오류를 냄 — `drop function if exists ...()` 선행 후 재적용해 해결(마이그레이션
  파일에도 반영).

## 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(전체 165개 파일 1913개 테스트 — 신규 케이스: gg-culture-events-adapter
  errorCounts 1개, seoul-culture-events diagnoseDropReason 5개, error-counts.mjs 2개,
  base-collector-adapter.mjs errorCounts 하위호환 2개) 통과.
- `npm run build` 통과.

## 특이 사항
- SQL 함수 수정은 코드 리포지토리(마이그레이션 파일)뿐 아니라 라이브 DB에도 직접
  적용했다 — 다음 `npx supabase db push` 또는 CI 마이그레이션 파이프라인이 있다면
  중복 적용 시 `drop function if exists`/`create or replace`라 멱등하게 안전하다.
- 이슈 1/2의 "즉시 적용 가능한 해결 코드"는 드롭 자체를 줄이는 로직 변경이 아니라
  원인 가시화(관측성) 개선이다 — 실제 데이터 품질 문제(예: GG API2의 지저분한 LOC_NM
  포맷)를 근본적으로 고치는 건 이번 지시 범위를 넘어서는 판단(추가 지오코딩 재시도
  전략 등)이 필요해 별도 확인 후 진행하는 것이 안전하다고 판단했다.
