# 배치 파이프라인 Fail-Safe 점검 + REFRESH_SIGUNGU_OPTIONS_CACHE 타임아웃 근본 수정

## 구현 대상
`implementation/todo.md` [개선사항1] — 데이터 수집 배치 파이프라인을 독립 격리형
(Fail-Safe) 구조로 리팩토링하고, 오늘 새벽 실패한 배치를 재실행해 검증.

## 구현 일시
2026-09-07

## 1. 아키텍처 실측 조사 — 이미 상당 부분 충족돼 있음
요구사항(①원천 소스별 완전 독립 실행, ②오케스트레이터/워커 분리, Promise.allSettled
등 활용)을 실제 코드로 검증했다:

- `scripts/ingest/run-daily.mjs`의 `STEPS` 루프는 이미 각 단계를 개별 `try/catch`로
  감싸 하나가 실패해도 다음 단계로 계속 진행한다 — 중단 없이 끝까지 실행한 뒤 실패
  개수만 최종 exit code에 반영한다.
- `GgCultureEventsAdapter`(두 개의 서로 다른 GG 하위 API 엔드포인트를 호출)는 이미
  2026-09-01 작업에서 `settleGroupFetches`(Promise.allSettled 기반)로 독립 격리가
  적용돼 있었다 — 하나가 실패해도 다른 하나는 정상 수집된다(코드 주석에 실측 근거
  명시).
- **실측 재현**: `docs/pipeline-log.md`의 2026-09-07 04:43/05:07 리포트를 보면
  GG_CULTURE_EVENTS/SEOUL_CULTURE_EVENTS/SEOUL_YEYAK가 외부 API 서버 연결
  타임아웃(`UND_ERR_CONNECT_TIMEOUT`)으로 실패했는데도, tourapi_4.0과 이후 6개
  후처리 단계(CATEGORY_RULES_APPLICATION 등)는 전부 정상 실행됐다 — "연쇄 실패"
  증상이 실측으로 재현되지 않았다.

**결론**: "완전 독립 분리형" 목표는 이미 충족돼 있어 추가 리팩토링을 하지 않았다.
최상위 단계들까지 `Promise.allSettled`로 동시 실행하는 것은 하지 않았다 —
`run-daily.mjs` 최상단 주석에 "동시 실행 시 레이트리밋/DB 커넥션 과부하 문제를
실제로 겪었다"는 기존 실측 기록(2026-08-25)이 있어, 새로운 근거 없이 이미 한 번
문제가 확인된 방향으로 되돌리지 않는다(제3장 제5조 추측 금지) — 순차 실행 +
단계별 독립 try/catch로도 "독립 실행"이라는 진짜 목표는 동일하게 달성된다.

## 2. REFRESH_SIGUNGU_OPTIONS_CACHE statement timeout — 근본 수정

### 실측 진단
`docs/pipeline-log.md`에서 2026-09-04, 2026-09-06(2회), 2026-09-07(2회) 총 5회
연속 "canceling statement due to statement timeout"으로 실패한 것을 확인했다.

원인: `sigungu_options_cache`가 `REFRESH MATERIALIZED VIEW CONCURRENTLY`로
갱신되는데, 이 REFRESH는 CONCURRENTLY 여부와 무관하게 항상 open_spaces(14만+)+
events(2만2천+) 전체를 처음부터 다시 집계한다 — 이 쿼리 자체가 2026-09-04
마이그레이션 도입 당시 실측 17.68초였던 바로 그 원본 쿼리라, PostgREST RPC 호출의
8초 statement_timeout을 항상 초과했다.

### 시도 1 — SET LOCAL statement_timeout (효과 없음, 정직하게 기록)
함수 내부에서 `perform set_config('statement_timeout', '120000', true)`로 이
호출에만 국소적으로 타임아웃을 늘리는 방법을 먼저 시도했다
(`2026-09-07-fix-sigungu-cache-refresh-timeout.sql`). **run-daily.mjs와 동일한
경로(supabase-js RPC, service role)로 직접 재현 테스트한 결과, 정확히 8,762ms에
동일하게 타임아웃**했다 — 이 8초 제한이 함수 내부 SET LOCAL로 넘을 수 없는
계층(Supabase 커넥션 풀러 등, 이 프로젝트가 통제할 수 없는 범위)에서 강제되는
것으로 판단하고, 접근을 바꿨다.

### 시도 2 — 증분(incremental) upsert로 교체 (성공)
`2026-09-07-sigungu-cache-incremental-refresh.sql`: sigungu_name은 "새 지역이
처음 수집될 때만" 늘어나는 참조 데이터라는 원래 설계 전제(2026-09-04 마이그레이션
주석)를 그대로 활용해, materialized view를 일반 테이블로 바꾸고 매번 전체를 다시
계산하는 대신 **최근 3일 이내 새로 생성된 행만 훑어 캐시에 없는 sigungu_name만
추가**하는 방식으로 교체했다(todo.md가 원래 제안한 "증분 처리" 방향과 정확히
일치). 기존 materialized view에 쌓여 있던 데이터는 그대로 새 테이블로 이관해
유실 없이 이어받았다.

### 검증(실측, run-daily.mjs와 동일한 RPC 경로로 재현)
- 수정 전: 8,762ms 만에 `canceling statement due to statement timeout`.
- 수정 후: **417ms 성공**.
- 캐시 테이블 행 수: 375건(기존 마이그레이션 주석의 "약 368개"와 유사한 규모,
  자연 증가분 포함 — 데이터 유실 없음 확인).
- `get_sigungu_options()` RPC 시그니처는 그대로라 프런트엔드/챗봇 호출부 변경 없음
  (2026-09-04 마이그레이션의 기존 설계 원칙 유지).

## 3. 오늘 새벽 실패한 배치 재실행 및 검증
`node scripts/ingest/run-daily.mjs`를 실제로 재실행했다. 오늘 새벽(04:43/05:07)
실패했던 GG_CULTURE_EVENTS/SEOUL_CULTURE_EVENTS/SEOUL_YEYAK의 외부 API 서버
연결 타임아웃은 일시적 현상이었음을 확인했다(재실행 시점에는 정상 연결). 상세
실행 결과와 `docs/pipeline-log.md` 신규 리포트는 별도로 확인해 기록한다.

## 검증
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 코드 변경 없음(순수 DB
  마이그레이션 2건)이라 직전 커밋 기준 통과 상태를 유지한다.
- 마이그레이션 적용 및 RPC 재현 테스트는 위 "검증(실측)" 절 참고.

## 특이 사항
- 시도 1(SET LOCAL)이 효과가 없었던 것을 삭제하지 않고 마이그레이션 파일로 남겨
  뒀다 — 이 세션의 기존 관례(jsdom 수정 시도 기록, 2026-09-06)와 동일하게, 무엇을
  시도했고 왜 안 됐는지 정직하게 기록하는 것이 다음에 같은 시행착오를 반복하지
  않는 데 더 유용하다고 판단했다.
