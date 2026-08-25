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
- [x] **[Task 9-6-15] 경기도 이벤트 수집 데이터 DB 적재 검증 및 docs/pipeline-log.md 갱신 확인** 🔍
  - **세부 작업 지시**:
    1. **경기도 수집 스크립트 실행 및 적재 검증**:
       - `ingest-gg-culture-events` 실행을 통해 당일/진행 중인 경기도 문화행사 데이터가 DB에 정상 적재되는지 최종 검증할 것.
    2. **오늘 날짜 경기도 이벤트 쿼리 검증**:
       - 메인 슬라이드/이벤트픽 API(`/events/today` 또는 `/api/home/feed`) 호출 시 경기도 지역 행사가 정상 피딩되는지 데이터 단위 검증 수행할 것.
    3. **파이프라인 로그 갱신**:
       - 수집 결과 건수 및 상태가 `docs/pipeline-log.md`에 정상 기록되는지 확인할 것.
  - **검증 결과 (2026-08-25)**:
    1. `npm run ingest:gg-culture-events` 실행 완료 — Supabase `events` upsert 2955건 정상 적재 확인(`external_id` 접두사 `GG_%` 기준 총 2955건 DB 실측 조회로 재확인).
    2. `/events/today`(`getTodayEvents`, `src/lib/home/get-home-feed.ts:372`)의 지역 필터(`regionOrFilter` → `sigungu_name`/`venue_name` ILIKE)가 경기도 `sigungu_name`(예: "경기도 광명시", "경기도 수원시" 등 실측 확인) 표기와 정상 매칭됨을 DB 쿼리로 직접 재현 검증. 현재 GG 이벤트 중 `end_date`가 정확히 오늘(2026-08-25)인 건은 0건(가장 이른 마감일 2026-08-26)이라 지금 이 시각 `/events/today` 응답에는 GG 항목이 없으나, 이는 실제 데이터 분포에 따른 정상 동작이며 쿼리/피딩 로직 자체는 결함 없음.
    3. `docs/pipeline-log.md`에 `2026-08-25 12:28 | GG_CULTURE_EVENTS | 2955 | 294 | ✅ [OK]` 행이 `scripts/ingest/lib/pipeline-log.mjs`에 의해 자동 기록됨을 확인.
  - **참고(범위 외 발견 사항, 수정하지 않음)**: GG 이벤트의 `is_free` 컬럼이 전량 `null`로 적재되어 있어(어댑터가 원본 API에 무료/유료 필드가 없어 `isFree`를 넘기지 않음 — 기존 설계) `getFreeFeed`(무료 피드 섹션)에는 노출되지 않음. 이는 이번 검증 작업 범위(Task 9-6-15는 적재/오늘자 쿼리/로그 확인만 지시) 밖의 별도 데이터 이슈이며, 원본 API에 없는 값을 임의로 추측해 채우는 것은 제3장 제4조(추측 금지)에 위배되므로 이번 작업에서는 수정하지 않음. 향후 별도 Task/Decision으로 다뤄야 함.
