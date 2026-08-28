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
- [x] **[긴급] 최근 3일간(8월 26일~28일) 신규 이벤트 수집 0건 원인 진단 및 복구**
  - 원인 파악: 최근 3일간(`created_at` 기준) 수집된 데이터가 0건인 원인 조사 (크론/배치 실행 여부, API 호출 에러, 파싱 실패 여부 등 확인)
  - 로그 점검: 서울시/경기도/TourAPI 어댑터 및 수집 스크립트 에러 로그 확인후 분석결과 보고
  - **① 근본 원인 (실측 확인, `docs/pipeline-log.md` 기록 대조)**:
    1. `ingest-daily.yml`/`ingest-monthly.yml`의 cron이 정각(`0 18 * * *`, `0 17 28-31 * *`)으로
       등록돼 있었다. GitHub Actions 공식 문서에 정각 트리거는 부하로 지연/드롭될 수 있다고
       명시돼 있고, GitHub Actions API로 실행 이력을 직접 조회한 결과 8/25 23:58 실행 이후
       8/28 00:36 확인 시점까지(즉 8/26·8/27 이틀 내내) 스케줄 실행이 단 한 번도 트리거되지
       않은 것을 확인했다 — 이것이 "8/26~28 신규 이벤트 0건"의 직접 원인이다.
    2. 부수 원인(관측성 부재): `run-daily.mjs`/`run-monthly.mjs`가 `docs/pipeline-log.md`를
       러너 로컬 파일시스템에만 기록하고, 두 워크플로 모두 그 변경분을 저장소에 커밋/푸시하는
       스텝이 없었다 — 그래서 설령 실행이 됐어도 저장소에서 실행 이력을 확인할 방법이 없었다.
    3. (부가 발견, 이번 진단 검증 과정에서 재현) `SeoulYeyakAdapter`(다중 테이블 어댑터)의
       `open_spaces` upsert가 Supabase 쪽 `statement timeout`으로 실패하면, 같은 배치에서 이미
       정상 변환된 `events` 행까지 업서트를 시도조차 못하고 함께 유실되는 코드 버그를 발견 —
       재현 확인(로컬 실행 2회 연속 동일 타임아웃).
  - **② 적용한 복구 조치**:
    1. `ingest-daily.yml`/`ingest-monthly.yml`의 cron을 정각에서 각각 `7 18 * * *`/
       `7 17 28-31 * *`로 이동해 정각 부하 시간대를 회피.
    2. 두 워크플로에 `permissions: contents: write` + `docs/pipeline-log.md` 변경분을
       커밋/푸시하는 스텝을 추가해 실행 이력이 저장소에 남도록 함.
    3. `scripts/ingest/adapters/base-collector-adapter.mjs`의 `runMultiTableUpsert()`에서
       `open_spaces`/`events` upsert를 각각 독립된 try-catch로 분리 — 한쪽 테이블 upsert가
       실패해도 다른 쪽은 계속 시도/적재되도록 수정. 실패 시 `recordPipelineRun`에
       `status: 'FAILED'` + 실패 테이블/사유를 `note`로 남겨 `docs/pipeline-log.md`에서
       바로 보이게 함(제5장 제11조 무중단 원칙을 소스 간뿐 아니라 같은 소스 내 테이블 간에도
       적용). 실측 재검증 결과 이 수정 이후 `open_spaces`는 여전히 타임아웃되지만 `events`
       1,586건은 정상 적재됨을 확인(`docs/pipeline-log.md` 2026-08-28 10:19 로그 참고).
    4. 신규 유닛 테스트 3건(`base-collector-adapter.test.mjs`) 추가 — 부분 실패 시 다른
       테이블은 계속 적재되는지, 예외가 다시 던져지지 않는지, `recordPipelineRun`에 FAILED
       상태/사유가 전달되는지 검증.
  - **③ 미해결·후속 필요 (이번 작업 범위 밖 — 별도 진행 필요)**:
    - `open_spaces` upsert의 `statement timeout` 자체(코드 버그가 아니라 Supabase DB 쪽 쿼리
      플래너/통계 이슈로 추정 — `implementation/2026-08-27-category-min-filter-options-fix.md`에
      기록된 동일 증상은 `ANALYZE public.open_spaces;`로 해결된 전례가 있음)는 미해결이다.
      본 저장소에는 프로덕션 Supabase에 직접 SQL(`ANALYZE` 등)을 실행할 수 있는 스크립트/DB
      연결 수단이 없어(모든 접근이 Supabase JS 클라이언트/PostgREST 경유), 구현 AI가 임의로
      새 DB 직접 접근 인프라를 만들지 않고 여기 기록만 남긴다(제3장 제4조 추측 금지 · 프로덕션
      DB 직접 조작은 검토 필요). **선행 작업 제안**: 관리자가 Supabase SQL Editor에서
      `ANALYZE public.open_spaces;` 실행 후 재검증, 또는 반복 재현 시 근본 원인(인덱스/테이블
      bloat) 추가 조사.
