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
- [ ] **크론 스케줄 시간대 한국 시간(KST) 새벽 3시 기준으로 재조정**
  - **목적**: GitHub Actions 서버 정각 부하(Dropped Runs) 회피 및 트래픽이 한적한 시간대 배치
  - **세부 내용**: 
    - 한국 시간(KST) 기준 **새벽 3시 대**에 실행되도록 설정 (UTC 기준으로는 **전날 저녁 18시 대** (`18:xx`)).
    - 정각(`0분`)을 피해 비정규 분 단위(예: `23 18 * * *`)로 임의 지정.
    - 대상 파일: `ingest-daily.yml`, `ingest-monthly.yml` 등 크론 워크플로 파일 전반.
    - 파일 내에 `KST 기준 새벽 3시 XX분 (UTC 18:XX)` 형태의 주석 명시 필수.
