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

- [x] **[Task 9-6-13] 이벤트픽(`/events/today`) 메인카드 배너 분리 및 상세 CTA/태그 정밀화** 🎪 (완료 2026-08-25)
  - **🚨 실행 전 필수 선행 작업**: 본 작업 착수 직전 `git pull`을 실행하여 최신 코드를 로컬 워킹 트리에 동기화할 것. → 수행 완료(Already up to date).
  - **세부 작업 지시**:
    1. **메인카드 배너 2종 유형 분리**: ✅ 완료
       - **오늘 마감**: 수요일~일요일 등 다일간 진행되는 행사 중 '오늘이 종료일(`end_date == today`)'인 이벤트.
       - **오늘 한정**: 시작일과 종료일이 '오늘 단 하루(`start_date == end_date == today`)'인 이벤트.
       - 메인 카드 상단 배너/칩에 `[⏰ 오늘 마감]` vs `[⚡ 오늘 한정]` 시각적 뱃지 구분 표기.
       - 구현: `src/lib/spaces/event-status.ts`의 신규 `getDateBannerBadge()` — `/events/today`(`getTodayEvents`)는 이미 `end_date=오늘`만 조회하므로 `start_date === end_date` 여부로 두 배너를 가른다. `src/components/cards/event-card.tsx` 상단에 리본 배너로 노출.
    2. **예약 버튼 미존재 시 예약 필요/불필요 태그 안내 강화**: ✅ 완료
       - `reservation_url`이 없는 경우, 단순 길찾기 폴백 외에 카드/상세 모달 내 `[예약불필요 / 현장방문]` 또는 `[사전예약필요 (링크미제공)]` 안내 태그/칩을 명확하게 노출할 것.
       - 구현: `src/lib/spaces/event-status.ts`의 신규 `getReservationAvailabilityTag()` — `reservation_url`이 없을 때 `is_reservation_required` 값에 따라 두 태그로 분기. `EventCard`(카드)와 `DetailModal`(상세, `src/components/map/detail-modal.tsx` 예약 안내 `dl` 행)에 모두 반영.
    3. **이벤트 5대 카테고리 매핑 검증**: ✅ 검증 완료(코드 변경 없음)
       - 실제 운영 DB 쿼리로 확인(2026-08-25): `/events/today` 후보(27건) 카테고리 분포 `KIDS_ACTIVITY:14, EXPERIENCE_CLASS:8, PERFORMANCE_FESTIVAL:5`. `is_active=true` 전체(샘플 5000건)에서는 `PERFORMANCE_FESTIVAL:547, EXHIBITION_MUSEUM:220, EXPERIENCE_CLASS:227, KIDS_ACTIVITY:4, OUTDOOR_NATURE:1, ETC:1` — 5대 카테고리 모두 1건 이상 존재.
       - `src/lib/spaces/category-meta.ts`의 `DEFAULT_META`(라벨 '기타') 폴백이 이미 존재해, 5대 카테고리에 속하지 않는 레거시 `ETC` 1건도 빈 뱃지 없이 항상 카테고리 태그가 표시됨을 확인 — Spec(`spec/data/ai-rule.md` 3.3)에 `ETC` 전용 라벨이 정의돼 있지 않아 임의로 새 라벨을 만들지 않고 기존 폴백 동작을 그대로 유지(제3장 제4조 추측 금지).
    4. **테스트 패스 검증**: ✅ 완료 — `npx tsc --noEmit` 통과, `npm run test` 325/325 통과(신규 `event-status.test.ts` 13건 추가로 기존 312건에서 증가, 회귀 없음), `npm run build` 프로덕션 빌드 성공.
