# [수집 파이프라인 안정성 강화] 크론 재조정 + 재시도 메커니즘 + open_spaces 타임아웃 재발 방지

## 요구사항
1. 크론 스케줄을 KST 새벽 3시대 · 비정규 분 단위로 재조정.
2. 수집 파이프라인에 코드 레벨 자동 재시도(Retry) 메커니즘 도입.
3. `open_spaces` 테이블 타임아웃 재발 방지 검증 + 청크 단위 업서트 구조 검토.

## 구현 일시
2026-08-28

## 1. 크론 스케줄 KST 새벽 3시대 재조정
- `ingest-daily.yml`: `18 07`(UTC) = KST 새벽 03:07. 기존에 이미 이 값이었음을 확인하고
  "KST 기준 새벽 3시 07분 (UTC 18:07)" 주석을 명시했다(8/26~8/27 정각 트리거 미실행 이슈로
  이미 정각을 피해 07분으로 옮겨져 있었음 — 이번 요구사항의 "새벽 3시대 + 비정규 분" 조건을
  이미 충족).
- `ingest-monthly.yml`: `7 17 28-31 * *`(KST 02:07) → `13 18 28-31 * *`(KST 03:13)로 이동해
  daily와 동일한 기준으로 통일. "내일(UTC)이 1일인지" 말일 판정 로직은 UTC 날짜 단위로만
  동작해 시각 변경의 영향을 받지 않음을 확인했다(같은 UTC 28~31일 범위 안에서는 몇 시로
  두든 말일 감지 결과가 동일).
- 두 파일 모두 "KST 기준 새벽 3시 XX분 (UTC 18:XX)" 형식의 주석을 명시했다.

## 2. 수집 파이프라인 자동 재시도(Retry) 메커니즘
- `scripts/ingest/lib/retry.mjs` 신규: `withRetry(fn, { retries, baseDelayMs, label })` —
  timeout/network 계열 에러 메시지(`isRetryableError`)만 판별해 짧은 지수 백오프
  (2s → 6s → 18s, 기본 최대 3회)로 재시도한다. 인증 실패, 유효성 검증 오류 등 영구적 에러는
  즉시 그대로 던져 불필요한 대기를 만들지 않는다.
- 적용 지점(코드 레벨, 요구사항 그대로 "어댑터 및 쿼리 업서트 부"):
  - `scripts/ingest/adapters/base-collector-adapter.mjs`의 `run()` — 모든 어댑터가 공유하는
    원본 API `fetch()` 호출.
  - `scripts/ingest/lib/supabase-admin.mjs`의 `upsertRows`/`upsertRawIngestData`/
    `upsertRowsSafeMerge`(기존 행 조회 + upsert 양쪽)/`fetchRawIngestData` — 모든 DB
    쓰기/조회 호출.
- 단위 테스트(`retry.test.mjs`, 6건): 재시도 가능/불가능 에러 판별, 성공 시 재시도 없음,
  재시도 후 성공, 재시도 불가 에러 즉시 전파, 최대 횟수 초과 시 마지막 에러 전파.
- 추가로(워크플로 레벨): `ingest-daily.yml`/`ingest-monthly.yml`의 메인 배치 스텝에 "1차
  실패 시 15분 대기 후 1회 전체 재실행" bash 로직을 넣었다 — 코드 레벨 재시도가 흡수하지
  못하는 광범위 장애(DB 전체 장애, 러너 네트워크 단절 등)에 대비한 안전망이다. upsert가
  external_id 기준 멱등 연산이라 재실행돼도 데이터가 중복/손상되지 않는다.

## 3. open_spaces 타임아웃 재발 방지 + 청크 업서트 구조 검토
- 근본 원인(실측): 대량 배치(예: playground 82,373건) 직후 플래너 통계가 stale해지면
  바로 다음 open_spaces upsert가 잘못된 실행계획을 선택해 statement timeout으로 실패하는
  패턴이 반복 확인됐다(`docs/pipeline-log.md` 2026-08-28 09:58/10:15/10:19 3연속 실패
  기록). 지금까지는 매번 수동으로 `ANALYZE public.open_spaces;`를 실행해 대응해왔다.
- 조치: `scripts/migrations/2026-08-28-open-spaces-auto-analyze-rpc.sql`로
  `public.analyze_open_spaces()` RPC 신설(SECURITY DEFINER, `service_role` 전용,
  `SET statement_timeout = '300000'` — PostgREST 경유 호출 시 역할 기본 statement_timeout이
  ANALYZE 소요 시간보다 짧아 함수 자체가 타임아웃하는 것을 실측으로 발견하고 5분으로
  늘려 해결) 후 프로덕션에 적용 완료. `run-daily.mjs`/`run-monthly.mjs` 배치 종료 시점에
  `ANALYZE_OPEN_SPACES` 후처리 단계로 자동 호출하도록 연결해, 수동 개입 없이 통계가 항상
  최신으로 유지되도록 구조화했다(dry-run에서는 실행하지 않음).
- 실측 재검증: RPC 적용 직후 `SeoulYeyakAdapter`를 실제로 재실행해, 직전까지 0/1290건
  (statement timeout)이던 open_spaces upsert가 **1290/1290건 정상 적재**됨을 프로덕션에서
  직접 확인했다(`docs/pipeline-log.md` 2026-08-28 11:07 기록).
- **청크 단위 업서트 구조 검토 결과**: `scripts/ingest/lib/supabase-admin.mjs`의
  `upsertRows`/`upsertRowsSafeMerge`는 이미 `UPSERT_BATCH_SIZE = 500`건 단위로 청크
  분할되어 있었다(이번에 신규 도입한 것이 아니라 기존 구조). 그런데도 타임아웃이
  발생했던 이유는 배치 크기 자체가 아니라 "청크 하나하나가 stale한 플래너 통계 위에서
  실행되어 각 청크의 실행계획 자체가 잘못 선택됐기 때문"이다 — 배치를 더 잘게 쪼개도
  각 청크가 여전히 잘못된 실행계획을 타므로 근본 해결이 되지 않는다(실측으로 확인된
  진짜 원인은 통계 staleness이지 배치 크기가 아님). 따라서 청크 크기를 추가로 줄이는
  대신 원인에 직접 대응하는 ANALYZE 자동화를 택했다. 기존 500건 청크 크기는 그대로
  유지해도 무방하다고 결론지었다(인덱스 `external_id` UNIQUE, `idx_open_spaces_location`
  GIST도 이미 적정하게 구성돼 있어 추가 조치 불필요, 테이블 블로트 징후도 없음을 확인).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 49개 파일 526건 통과(신규 `retry.test.mjs` 6건 포함, 회귀 없음).
- `npm run build`: 성공, 라우트 목록 변화 없음(스크립트/워크플로/마이그레이션 변경만).
- 워크플로 YAML 2종 모두 파싱 정상 확인(js-yaml).
- 프로덕션 실측: RPC 배포 후 statement_timeout으로 인한 함수 자체 실패를 실측으로
  발견해 `SET statement_timeout = '300000'`으로 수정, 재적용 후 성공 확인.
  `SeoulYeyakAdapter` 실제 재실행으로 open_spaces 1290/1290건 정상 적재를
  `docs/pipeline-log.md`에 기록된 실측 데이터로 확인.

## 특이 사항
- `analyze_open_spaces()` RPC는 `service_role` 전용이며 `anon`/`authenticated`에는 권한을
  주지 않았다 — 수집 파이프라인 전용 유지보수 함수라 공개 RPC(`get_nearby_spaces_and_events`
  등)와 다른 권한 정책을 의도적으로 적용했다.
- 워크플로 레벨 15분 대기 재시도는 사용자 요구사항(코드 레벨 재시도)을 넘어서는 추가
  안전망이다 — upsert의 멱등성을 근거로 안전하다고 판단해 유지했다.
