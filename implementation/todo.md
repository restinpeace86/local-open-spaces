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

### Task 목록
- [x] **[Task 9-6-14] ETL 파이프라인 수리 및 모니터링·견고화 체계 구축** ⚙️📊
  - **재확인 결과(2026-08-25)**: 이 항목은 신규 작업이 아니라 직전 세션(commit `8b707f8`)이 이미 구현 완료한 내용이 todo.md에 중복 재기입된 것으로 확인됨. 코드 재검증 후 체크 처리:
    1. `ingest-gg-culture-events` 경기도 크롤러 수리 → `gg-culture-events-adapter.mjs`의 `transformCultureEvents`/`transformFoundationEvents`가 날짜(`formatYyyymmdd`/`BGNG_NM` 파싱)·장소(시/군명 매칭, LOC_NM 콤마 분리, 경기도 바운딩 박스 오매칭 방지) 필드를 정상 처리함을 단위 테스트(`gg-culture-events-adapter.test.mjs`, 날짜·장소 케이스 포함)로 재확인. 실 계정 API 키(`GG_DATA_API_KEY`/`VWORLD_API_KEY`)를 통한 프로덕션 즉시 적재는 매일 04:00 KST GitHub Actions 스케줄(`ingest-daily.yml`)이 이미 담당.
    2. ETL 예외 처리/견고화 → 원자성: `upsertRows`(`scripts/ingest/lib/supabase-admin.mjs`)는 `external_id` 기준 `upsert`만 사용하며 TRUNCATE 없음(코드베이스 전수 검색 확인, 매칭된 유일한 "truncate"는 무관한 문자열 절단 헬퍼). Graceful Parsing: `transformCultureEvents`/`transformFoundationEvents` 모두 행 단위 `try/catch`로 개별 파싱 오류를 로그(`console.warn`) 후 스킵, 전체 배치는 중단하지 않음.
    3. 파이프라인 모니터링 로그 → `scripts/ingest/lib/pipeline-log.mjs`의 `recordPipelineRun()`이 `BaseCollectorAdapter.run()`(공통 진입점)에서 호출되어 매 실행마다 `docs/pipeline-log.md` 표 최상단에 수집 건수/에러 건수 행을 추가하고, `status === 'FAILED'` 또는 `count === 0`이면 `🚨 [CRITICAL]` 뱃지를, 그 외에는 `✅ [OK]` 뱃지를 자동 표기함.
  - **⚠️ 스킵 사유(Git Safety Protocol)**: 본 항목에 내장돼 있던 `git fetch origin main && git reset --hard origin/main` 강제 초기화 지시는 미커밋 작업 소실 위험이 있는 파괴적 명령이라 실행하지 않음 — 이전 세션(`8b707f8`, `6d98a3e`)과 동일한 판단.
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 325/325 통과, `npm run build` 통과.
