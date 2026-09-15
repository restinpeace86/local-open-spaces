# [개선사항 3] 파이프라인 로그 DB화 및 관리자 [파이프라인 관리] 탭

## 구현 대상
`implementation/todo.md` [개선사항 3] — `docs/pipeline-log.md` 마크다운 로깅 방식 폐기,
`pipeline_logs` 테이블 도입, 관리자 전용 [파이프라인 관리] 탭(현황판 + 개별 소스 수동
재수집 통합) 구현. 사용자가 명시적으로 지적한 3가지 불일치 사례 조사/수정 포함.

## 구현 일시
2026-09-15

## 변경 사항

### 1) `pipeline_logs` 테이블 (`scripts/migrations/2026-09-15-pipeline-logs-table.sql`)
요청 원문의 컬럼 구성(`id`/`agent_name`/`status`/`executed_at`/`error_message`/
`meta_data`/`description`/`period`/`updated_at`)을 그대로 따랐다. `status`는 요청
예시(`SUCCESS`/`FAILED`/`RUNNING`) 대신 기존 코드베이스가 이미 쓰던 `'OK'`/`'FAILED'`
두 값을 그대로 채택했다(제5장 제4조 기존 구조 우선 — 이 스크립트 실행 모델은 완료 후에만
기록하므로 'RUNNING'을 발행할 생산자가 없음). RLS는 서비스 롤 전용(내부 운영 로그, 일반
사용자 노출 불필요). 운영 DB에 직접 적용 후 `pg_indexes`/실제 insert로 확인.

### 2) 이중 로깅을 단일 창구로 통합
기존에는 개별 어댑터의 `run()` 내부(`BaseCollectorAdapter` → `pipeline-log.mjs`의
`recordPipelineRun()`)와 배치 오케스트레이터(`batch-log.mjs`의 `recordBatchRun()`)가
각각 별도 시점에 마크다운에 기록했다. 배치 오케스트레이터가 이미 모든 소스(원본 수집
4~16개 + 후처리 단계 전부)의 최종 result를 한 곳에 모아 받는다는 점에 착안해,
`recordBatchRun()` 하나만 DB에 기록하는 단일 창구로 삼았다(같은 실행을 가리키는 중복
행을 만들지 않기 위함). `recordPipelineRun()`은 제거하고 `pipeline-log.mjs`에는
`countRawItems()`만 남겼다. `<details>` 상세 블록이 담던 테이블별 세부 수치
(perTable/errorCounts/excludedCount)는 반환값을 통해 `meta_data` JSON에 그대로
보존된다 — `base-collector-adapter.mjs`의 `runMultiTableUpsert()`가 부분 실패를
`hasPartialFailure` 필드로 명시적으로 반환하도록 바꿔 `recordBatchRun()`이 FAILED
상태를 정확히 판정할 수 있게 했다(기존에는 `recordPipelineRun()` 호출 시점에만 알 수
있던 정보).

`run-daily.mjs`/`run-monthly.mjs`의 `recordBatchRun()` 호출 6곳 모두 `await`를
추가했다(DB insert는 비동기).

### 3) `pipeline-agent-registry.mjs` (신규) — 에이전트 설명/기간 단일 출처
run-daily.mjs/run-monthly.mjs에 실제 존재하는 모든 sourceKey(30개, ENV_PRECHECK +
원본 수집 20개 + 후처리 9개)를 전수 조사해 등록했다. 각 파일 헤더 주석에서 실제 수집
대상을 요약했다. 등록되지 않은 미래 sourceKey는 조용히 숨기지 않고 description을
null로 그대로 노출한다(무중단 원칙).

### 4) 사용자가 지적한 3가지 불일치 조사 및 수정
- **"Monthly에 GG_EVENTS로 된 소스... 왜 이벤트성 이름으로 monthly로 가져오는지"**:
  실측 확인 결과 `gg-events-adapter.mjs`는 공공 수영장 + 물놀이형 수경시설(상시 시설,
  `open_spaces`)을 수집한다 — 이름이 오해를 부르는 레거시 명칭이었다(파일 자체 주석에
  과거 시한성 이벤트로 재분류했다가 사용자 피드백으로 되돌린 이력이 남아있음). 오케스트
  레이션/로깅 전용 식별자(`sourceKey`)만 `GG_SWIMMING_POOL`로 변경했다. 이미 적재된
  `open_spaces.source_type = 'GG_EVENTS'` 값(카테고리 폴백 로직이 참조하는 별개
  컬럼)은 손대지 않았다 — 데이터 마이그레이션이 필요 없는 무관한 값이고, 건드리면
  `detailed-category-fallback.mjs`/`legacy-source-category-mapping.mjs`까지 영향
  범위가 커져 이번 "명칭 명확화" 요청의 스코프를 벗어난다.
- **"gg_public... GG_CULTURE_EVENTS 실패로 건너뜀... 왜 실패했는지 알 수 없음"**:
  `run-daily.mjs`의 `GG_CULTURE_LOCATION_ENRICHMENT` 스킵 메시지가 정적 문자열
  `'GG_CULTURE_EVENTS 실패로 건너뜀'`만 남겨 관리자가 실제 원인을 알려면 다른 행
  (`GG_CULTURE_EVENTS` 자체)을 다시 찾아야 했다. 스킵 사유에 업스트림 실패의 실제
  `note`(에러 메시지)를 그대로 포함하도록 수정했다 — 이제
  `"GG_CULTURE_EVENTS 실패로 건너뜀 (원인: <실제 에러 메시지>)"` 형태로 한 행에서 바로
  원인까지 확인된다.
- **"개별 소스 수동 재수집은 daily에 4개만 있는데 pipeline-log.md는 agent별로 되어있어
  불일치"**: 조사 결과 `STEPS` 배열(관리자 재수집 드롭다운의 소스)에는 원본 수집
  어댑터만 있고(daily 4개/monthly 16개), 후처리 단계(`CATEGORY_RULES_APPLICATION` 등
  daily 10개/monthly 6개)는 `runSingleDailySource`/`runSingleMonthlySource`로 개별
  재실행할 수 있는 경로가 원래 없었다 — 반면 로그(과거 마크다운, 이제 DB)에는 둘 다
  기록돼 왔다. 이번 관리자 화면은 이 실제 구조를 정직하게 반영한다: 현황판에는 30개
  에이전트 전부(원본 수집 + 후처리)를 보여주고, "재수집 실행" 버튼은 실제로 개별
  재실행 가능한 원본 수집 소스에만 붙인다(없는 기능을 있는 것처럼 보이지 않음, 제5장
  제2조 Spec 우선). 후처리 단계 개별 트리거 자체를 새로 만드는 것은 이번 지시서가
  요청한 범위(불일치 정합화)를 넘어서는 별도 기능 확장이라 손대지 않았다.

### 5) 관리자 [파이프라인 관리] 탭 (`/admin/pipeline`)
신규 페이지. `/api/admin/pipeline-logs`(신규, 에이전트별 최신 실행 1건을 조회 시점에
계산 — DISTINCT ON을 지원하지 않는 Supabase JS 클라이언트 대신 최근 500행을 가져와
클라이언트 측에서 reduce, 에이전트 수가 적어 이 정도 스캔은 가볍다는 판단)에서 상태를
불러와 daily/monthly로 묶어 표시하고(에이전트명/설명/상태뱃지/최근 실행/에러 또는 요약/
재수집 버튼), 기존 `/api/admin/ingest/rerun`을 그대로 재사용해 재수집을 트리거한다.
`/admin/data-grid`에 산재해 있던 `IngestRerunPanel`(개별 소스 수동 재수집 UI)은
제거하고 이 탭으로 가는 링크로 대체했다.

### 6) `docs/pipeline-log.md` 처리
삭제하지 않고 파일 최상단에 폐기 안내(더 이상 갱신되지 않음, `pipeline_logs` 테이블/
`/admin/pipeline` 탭 참고)를 추가해 과거 기록은 그대로 보존했다.

### 7) TypeScript 타입 재생성
`pipeline_logs` 등 신규 테이블 사용을 위해 `npx supabase gen types typescript`로
`src/types/database.types.ts`를 재생성했다(직전 파일에 반영되지 않았던
`events_filter_options_cache`/`refresh_events_filter_options_cache`도 함께 반영됨 —
기존에 raw SQL로만 추가되고 타입 재생성이 누락돼 있었음). 사용되지 않는 `graphql`/
`graphql_public` 스키마 타입은 `--schema public` 생성 옵션상 빠졌으며, 코드베이스
전체에서 참조가 없음을 확인 후 반영했다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1700개 통과), `npm run build` 모두 통과.
- 운영 DB 실측: `runSingleDailySource('TOUR_API_FESTIVAL')` 개별 재수집을 실제로
  실행해(279건 수신/반영) `pipeline_logs`에 정확한 `agent_name`/`status`/
  `meta_data`/`description`/`period` 행이 생성됨을 직접 조회로 확인.
- 로컬 개발 서버로 `/api/admin/pipeline-logs`, `/api/admin/ingest/rerun`(GET, 이제
  `GG_SWIMMING_POOL` 반영 확인), `/admin/pipeline` 페이지 렌더링을 각각 curl/응답
  본문으로 직접 확인.

## 이번 범위에서 의도적으로 손대지 않은 것
- 후처리 단계(9개)의 개별 수동 재수집 트리거 신설 — 위 4) 참고, 이번 지시서는 "정합성
  불일치 해결"을 요청했지 새 트리거 경로 확장을 요청하지 않았다.
- `open_spaces.source_type = 'GG_EVENTS'` 값 자체의 리네이밍 — 별개 데이터 컬럼이라
  범위 밖(위 4) 참고).
- 이 앱 전반의 로그인/세션 인증 부재(known gap) — `/admin/pipeline`도 기존
  `/admin/data-grid`/`/admin/reservations`와 동일하게 접근 제어 없이 구현했다(제3장
  제5조 추측 금지 — 인증은 별도 지시서 범위).
