## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---
# To-Do List
- [x] 프로덕션 DB 통계 갱신 완료 (`ANALYZE public.open_spaces;` 실행 완료 - `Success. No rows returned`)
- [x] **크론 스케줄 시간대 한국 시간(KST) 새벽 3시 기준으로 재조정** (2026-08-28 완료)
  - `ingest-daily.yml`: `7 18 * * *` (KST 새벽 03:07, 기존 그대로 — 정각 회피 조건 이미 충족)
  - `ingest-monthly.yml`: `7 17 28-31 * *`(KST 02:07) → `13 18 28-31 * *`(KST 03:13)로 이동해 daily와 동일한 "새벽 3시대 + 비정규 분" 기준으로 통일. "내일이 1일인지" 말일 감지는 UTC 날짜 단위 판정이라 시각 변경의 영향 없음을 확인.
  - 두 파일 모두 `KST 기준 새벽 3시 XX분 (UTC 18:XX)` 형식의 주석 명시 완료.
- [x] **수집 파이프라인 자동 재시도(Retry) 메커니즘 도입** (2026-08-28 완료)
  - 코드 레벨: `scripts/ingest/lib/retry.mjs` 신규 — timeout/network 계열 에러만 판별해 짧은 지수 백오프(2s→6s→18s, 최대 3회)로 재시도하는 `withRetry()` 도입. `supabase-admin.mjs`의 모든 DB 호출(upsert/select/raw 조회)과 `BaseCollectorAdapter.run()`의 `fetch()` 호출에 적용. 인증 실패 등 영구적 에러는 즉시 던져 불필요한 대기 방지. 단위 테스트(`retry.test.mjs`) 추가.
  - 워크플로 레벨: `ingest-daily.yml`/`ingest-monthly.yml`의 메인 배치 스텝에 "1차 실패 시 15분 대기 후 1회 전체 재시도" bash 로직 추가 (upsert가 external_id 기준 멱등 연산이라 재실행 안전).
- [x] **`open_spaces` 테이블 성능 최적화 및 타임아웃 재발 방지 검증** (2026-08-28 완료 — 실측 재검증까지 완료)
  - 근본 원인: 대량 배치(예: playground 82,373건) 직후 플래너 통계가 stale해지면 다음 open_spaces upsert가 statement timeout으로 실패하는 패턴이 반복 확인됨(수동 `ANALYZE`로 그때그때 대응해왔음 — 재발 방지 아님).
  - 조치: `scripts/migrations/2026-08-28-open-spaces-auto-analyze-rpc.sql`로 `public.analyze_open_spaces()` RPC 신설(SECURITY DEFINER, service_role 전용) 후 프로덕션에 적용 완료. `run-daily.mjs`/`run-monthly.mjs` 배치 종료 시점에 자동 호출하도록 `ANALYZE_OPEN_SPACES` 후처리 단계 추가 — 매번 수동 개입 없이 통계가 항상 최신으로 유지됨.
  - 실측 이슈 발견 및 수정: 최초 배포한 RPC를 실행하자 ANALYZE 자체가 PostgREST 기본 statement_timeout에 걸려 실패함을 실측 확인 → 함수에 `SET statement_timeout = '300000'`(5분)을 지정해 해결, 재적용 후 RPC 성공 확인.
  - 최종 실측 재검증: RPC 성공 직후 `SeoulYeyakAdapter`를 실제로 재실행해 이전에 0/1290건(타임아웃 실패)이던 `open_spaces` upsert가 **1290/1290건 정상 적재**됨을 프로덕션에서 직접 확인(`docs/pipeline-log.md` 기록됨). 인덱스(`external_id` UNIQUE, `idx_open_spaces_location` GIST)는 기존에 이미 적정하게 구성돼 있어 추가 조치 불필요, 블로트 징후 없음.
  - 청크 단위 업서트 구조 검토: `supabase-admin.mjs`는 이미 `UPSERT_BATCH_SIZE=500`건 단위로 청크 분할돼 있었음을 확인. 원인은 배치 크기가 아닌 통계 staleness였으므로 청크 크기는 그대로 유지하고 ANALYZE 자동화로 근본 대응(상세: `implementation/2026-08-28-ingest-pipeline-reliability.md`).

- [x] **[open_spaces 세부 중분류 매핑 시뮬레이션 및 자동 매핑 로직 구축]** (2026-08-28 완료)
  - **0단계**: 원본 카테고리(`category`)/이름(`name`) 분포 분석 완료 — NULL 43,445건(31.3%) 중 4개 소스(LOCALDATA_PLAYGROUND/LOCALDATA_AMUSEMENT/SWIMMING_POOL/GG_EVENTS)는 name이 호스트 건물명이라 taxonomy 대상 아님을 발견, 8개 소스로 범위 한정.
  - **1~3단계**: 키워드 규칙 초안 작성 → 시뮬레이션(`scripts/simulations/open-spaces-detailed-category-dryrun.mjs`) → 검토·보완 → 확정. 21종 요청 중 5종은 기존 category_min 재사용(공연장/전시실/체육관/운동장/공원), 14종 신규 추가. 상세: `docs/open-spaces-detailed-category-mapping-dryrun-report.md`.
  - **적용**: `category_rules`에 63건 신규 시드 + 캠핑장에 "글램핑" 키워드 보강. '기타' 폴백은 범용 엔진 오염을 피하기 위해 전용 함수(`scripts/ingest/lib/detailed-category-fallback.mjs`, 8개 대상 source_type 한정)로 구현, run-daily.mjs/run-monthly.mjs에 재발 방지 단계로 연결.
  - **실측 결과**: 신규 분류 6,982건 + 기타 폴백 20,119건, 최종 NULL 16,344건(전량 대상 외 4개 소스). 기타 오염(대상 외 소스) 0건 확인.
  - **검증**: `npx tsc --noEmit`/`npm run test`(51파일 536건)/`npm run build` 통과. 상세: `implementation/2026-08-28-open-spaces-detailed-category-mapping.md`.
