# RAW 레이어/Service 레이어 2단계 ETL 파이프라인 분리 구축

## 구현 대상
- 사용자 지시([긴급 아키텍처 개편], 2026-08-25): 단일 파이프라인 직수집 방식에서 발생할 수 있는
  데이터 유실/재가공 불가/신규 API 확장성 저해 문제를 해결하기 위해, "RAW 데이터 100% 무오염
  보존" → "표준 매퍼를 통한 서비스 적재" 2단계 ETL 아키텍처로 전환
- 신규 `raw_ingest_data` 테이블(원천 API 응답 통째 보존)
- `BaseCollectorAdapter`에 RAW 레이어 opt-in 훅(`getRawRows`/`reconstructFromRawPayloads`) 및
  2단계 단독 재실행 메서드(`runServiceTransformFromRaw`) 추가
- `SeoulYeyakAdapter`를 RAW 레이어 opt-in 첫 적용 사례로 마이그레이션
- Service 레이어 재가공 재적재용 COALESCE 기반 Safe UPSERT(`upsertRowsSafeMerge`)
- `docs/pipeline-log.md` 일간 로깅에 RAW 적재 건수 / Service 적재 건수 구분 기록

## 구현 일시
2026-08-25

## 변경 사항

### 1단계: RAW 메타 테이블
- `scripts/migrations/2026-08-25-raw-ingest-data-table.sql`: `raw_ingest_data(source, source_id,
  fetched_at, raw_payload)`, PK `(source, source_id)`. `node scripts/apply-sql.mjs`로 실제 DB에
  적용 완료. 기존 스키마에 RLS 정책이 전혀 없음을 확인해(제5장 제4조 기존 구조 우선) 동일하게
  RLS 없이 생성
- `scripts/ingest/lib/supabase-admin.mjs`: `upsertRawIngestData(client, source, rawRows)` —
  `[{sourceId, payload}]`를 받아 `(source, source_id)` 복합키로 500건 배치 ON CONFLICT DO UPDATE
  (유효성 검증/드롭 없음이 핵심). `fetchRawIngestData(client, source)` — 재가공(2단계 단독
  재실행)용 페이지네이션 조회

### BaseCollectorAdapter 확장 (하위 호환 opt-in)
- `getRawRows(rawItems)` / `reconstructFromRawPayloads(payloads)`: 기본값은 각각 `null`/항등
  함수 — 오버라이드하지 않는 기존 24개 어댑터는 `run()` 동작이 기존과 완전히 동일함(RAW 적재
  자체가 스킵됨)
- `run()`: `fetch()` 직후, `transform()`(유효성 검증으로 행을 drop함) 이전 시점에
  `getRawRows()`가 값을 반환하면(그리고 dry-run이 아니면) `raw_ingest_data`에 먼저 무오염
  보존 — transform이 걸러내는 행도 RAW 레이어에는 남는다
- `runServiceTransformFromRaw({dryRun})`(신규): 원본 API를 다시 호출하지 않고 `raw_ingest_data`에
  보존된 payload를 `reconstructFromRawPayloads()`로 복원 → `transform()` → `upsertRowsSafeMerge()`로
  재적재. 원본 API 장애나 파서 로직만 고친 경우 재수집 없이 재가공 가능

### SeoulYeyakAdapter 마이그레이션
- `getRawRows()` 오버라이드: `item.SVCID`를 `source_id`로, 원본 항목 전체를 `payload`로 하는
  쌍 생성. `transform()`과 달리 경위도 누락 등으로 인한 drop이 전혀 없음(SVCID만 있으면 보존)

### Service 레이어 Safe UPSERT
- `scripts/ingest/lib/supabase-admin.mjs`: `upsertRowsSafeMerge(client, table, rows)` — 충돌 시
  무조건 덮어쓰는 `upsertRows()`와 달리, 기존 행의 컬럼이 NULL일 때만 새 값으로 채우고 값이
  있으면 보존(`COALESCE(existing, incoming)` 시맨틱). 컬럼 목록을 하드코딩한 SQL(RPC 함수) 대신
  기존 행을 `select('*').in('external_id', ids)`로 조회해 JS에서 범용적으로 병합 — 스키마가
  계속 바뀌어도(제5장 제6조) 컬럼 목록을 별도로 유지보수할 필요가 없음
- `runServiceTransformFromRaw()`만 이 함수를 쓰고, 기존 25개 어댑터의 `run()`은 여전히
  `upsertRows()`(무조건 덮어쓰기)를 그대로 씀 — 기존 프로덕션 적재 동작에 영향 없음(제3장
  제3조 임의 판단 금지 — 요청 범위를 넘는 기존 동작 변경 안 함)

### 로깅
- `scripts/ingest/lib/pipeline-log.mjs`: `recordPipelineRun`에 `rawArchivedCount` 파라미터 추가,
  로그 표를 6칸 → 7칸(RAW 적재 건수 / Service 적재 건수 분리)으로 변경. RAW 레이어 미적용
  어댑터는 해당 칸에 `-` 기록(기존 24개 어댑터가 이 로그 형식 변경 때문에 별도 코드 수정이
  필요하지 않도록 optional 파라미터로 둠)
- `docs/pipeline-log.md`: 헤더 갱신 + 변경 배경 설명 추가. 기존 로그 행은 소급 수정하지 않고
  구버전 형식 그대로 보존

## 검증 결과
- `node scripts/apply-sql.mjs scripts/migrations/2026-08-25-raw-ingest-data-table.sql`: 실제 Supabase DB에
  `raw_ingest_data` 테이블 생성 확인
- 신규/수정 테스트 48건 전체 통과: `base-collector-adapter.test.mjs`(7), `seoul-yeyak-adapter.test.mjs`
  getRawRows 3건 추가, `pipeline-log.test.mjs`(3, 신규), `supabase-admin.test.mjs`(upsertRawIngestData
  4 + fetchRawIngestData 2 + upsertRowsSafeMerge 7, 기존 upsertRows 6 유지)
- `npx tsc --noEmit`: 오류 없음
- `npm run test`: 34개 파일 351건 전체 통과
- `npm run build`: Next.js production build 성공

## 특이 사항
- 사용자 지시가 예시로 든 소스는 `seoul_public_culture`/`seoul_public_facility`/`gg_public`/
  `tourapi_4.0` 4종이었으나, 이번 세션에서는 `SeoulYeyakAdapter` 1건만 RAW 레이어에 실제
  연결했다 — 나머지 소스는 동일한 `getRawRows()` opt-in 패턴으로 후속 적용 가능한 구조는
  갖췄으나(BaseCollectorAdapter가 공통 오케스트레이션을 담당하므로 각 어댑터별로 `getRawRows()`
  한 메서드만 추가하면 됨), 이번 작업에서 나머지 어댑터까지 전수 마이그레이션하지는 않았다
- `upsertRowsSafeMerge()`는 배치당(500건) 1회의 `select('*').in(...)` 조회가 추가로 발생한다 —
  일반 `upsertRows()`보다 DB 왕복이 늘지만, "RAW→Service 재가공"은 정기 수집처럼 상시
  실행되는 경로가 아니라 장애 복구/파서 수정 후 수동 재실행되는 경로라 판단해 이 비용을
  감수함(대량 상시 소스인 playground.mjs 등 기존 25개 어댑터의 `run()`은 영향 없음)
- 이번 세션 초반에 별도 세션이 동시에 같은 작업 디렉토리에 커밋/푸시 중인 상황을 발견해
  사용자 지시("변경사항 폐기 후 최신 상태로 새로 시작")에 따라 `git checkout -- .` +
  `git pull`로 초기화한 뒤(그 세션의 untracked 파일 `scripts/migrations/2026-08-25-backfill-event-6category.sql`은
  보존) 이번 RAW 레이어 작업을 시작했다 — 이 작업은 그 세션의 변경과 독립적이다
