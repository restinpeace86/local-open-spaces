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
- [ ] **`open_spaces` 테이블 성능 최적화 및 타임아웃 재발 방지 검증**
  - `ANALYZE public.open_spaces;` 이후 다음 수집 파이프라인 트리거 시 `open_spaces` 타임아웃 해소 여부 실측 재검증
  - 반복 재현 시 배치 묶음 크기(Batch Size) 쪼개기(청크 단위 업서트), 인덱스 상태 점검 및 테이블 블로트(Bloat) 여부 등 근본적인 구조적 원인 추가 조사 및 대책 수립
