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
- [x] **[최신 `spec.md` 동기화 및 이벤트픽(Event Pick) 데이터 파이프라인 연동]** — 완료(2026-08-27).
  - **0. Pre-check**: `git pull` 결과 원격과 이미 동기화 상태(추가 변경 없음). `docs/spec.md` 1절
    "이벤트픽 화면 노출 3대 기본 전제 조건"과 직전 완료 Task
    (`implementation/2026-08-27-target-audience-10tier-real-application.md` 5절)이 스스로
    명시한 "홈 피드 쿼리는 아직 category_min/target_audience 필터를 전혀 사용하지 않는다 —
    이번 인덱스는 향후 홈 피드가 이 3조건 필터를 실제로 사용하게 될 때를 대비한 선제적
    최적화" 기록을 확인, 본 Task가 정확히 그 후속 배선 작업임을 확인(홀드/상충 없음).
  - **1. 구현**: `src/lib/home/get-home-feed.ts`의 이벤트픽 화면에 노출되는 모든 `events` 조회
    쿼리(`getTodayEvents`, `getReservationOpenEvents`(2개 하위 쿼리), `searchEvents`,
    `getProvinceWideEvents`, `getFreeFeed`의 events 분기, `getThemeSpotFeed`의 events 분기,
    `getCategoryFeed`)에 `EVENT_PICK_TARGET_AUDIENCES`(`INFANT`/`KIDS_PRE`/`KIDS_SCHOOL`/
    `FAMILY`/`ALL`) `.in()` 필터와 `category_min` `.not(is null)` 필터를 기존 `is_active=true`
    조건 옆에 공통 추가. 스팟픽(`open_spaces`) 쿼리는 대상에서 제외(Decision 010 — 이벤트픽
    전용 조건).
  - **2. 검증**: `npx tsc --noEmit` clean, `npm run test` 470건 전부 통과(테스트 픽스처
    `eventRow()`에 `target_audience`/`category_min` 기본값 추가 및 mock 빌더에 `.not()` 지원
    추가), `npm run build` 성공. `npm run dev` 로컬 서버로 `/`, `/events/today`, `/nearby`,
    `/api/home/feed`, `/api/home/category-feed`, `/api/home/free-feed`,
    `/api/home/theme-feed`, `/api/home/search` 전부 200 응답 및 필터링된 실데이터 정상 반환
    실측 확인.
