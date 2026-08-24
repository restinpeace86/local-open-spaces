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

- [x] **[Task 9-6-10] 하단 5대 탭 브랜드 구조 개편 & 지도/피드 수리** 🧭 — **재개 및 완료 (2026-08-25)**
  - **재점검 결과**: Decision 010(하단 5탭 [추천픽-스팟픽-이벤트픽-찜-마이] 확정) 및 `spec/map/spatial-search.md` 2.2(스팟픽=상시 공간 전용 지도, 이벤트픽=`/events/today` 시한성 피드로 완전 이관)가 원격에 반영 완료되어 있어 기존 충돌 요인이 해소됨을 확인.
  - **구현 내용** (작업 디렉터리에 미커밋 상태로 이미 존재하던 구현을 검증 후 확정):
    1. `src/components/nav/bottom-tabs.tsx`, `feature-flags.ts`: 탭을 `[추천픽(✨ 비활성, ENABLE_RECOMMEND_TAB)-스팟픽(📍 /nearby)-이벤트픽(🎪 /)-찜-마이]`로 재편. "카테고리"(`/region`) 탭은 하단 탭에서만 제외(화면 자체는 유지).
    2. `src/components/home/home-view.tsx`: 이벤트픽(`/`) 화면에서 기존 EVENTS/SPACES 대분류 토글을 제거하고 항상 이벤트만 조회하도록 단일화(상시 공간은 스팟픽이 전담).
    3. `src/components/map/map-explorer.tsx`, `kakao-map-view.tsx`: `/nearby`를 상시 공간(open_spaces) 전용 RPC 조회로 단일화하고, 파란 반경 원(Circle) 오버레이를 제거, MarkerClusterer(minLevel 5, gridSize 80)로 줌 레벨별 계층 클러스터링을 적용, center/radius 변경 시 `panTo`+`setLevel`로 실시간 이동 연동.
  - **검증**: `npx tsc --noEmit` 통과, `npm run test`(30 files / 312 tests) 전체 통과, `npm run build` 성공.

- [ ] **[Task 9-6-11] 상세 페이지 조건부 예약 UI 및 링크 처리 정밀화** 🔗 — **스킵 (보류, Spec 미정의 비즈니스 로직 발견)**
  - **스킵 사유**: 본 Task가 지시하는 "공공/무료=🏛️ 공공 예약하기, 유료/민간=🎟️ 할인 예매하기(제휴 딥링크), 기타=🗺️ 길찾기"라는 3분류 조건부 CTA 버튼 체계는 `spec/event/event-detail.md`(예약하기+길찾기 2버튼만 정의), `spec/space/space-detail.md`(길찾기+관련 행사 보기만 정의), `project/decision-log.md` 어디에도 근거가 없다. 현재 구현(`src/components/map/detail-modal.tsx`)도 `reservation_url`/`info_url` 기반의 단순 2버튼 구조뿐이며, "제휴 딥링크"·"할인 예매" 개념은 Decision 008에서 "코드 마이그레이션 대기(미착수, 별도 승인 필요)" 항목 3번(쿠팡 파트너스 등 커머스 핫딜 API 연동)에 걸려 있어 이 역시 미승인 상태다. 제3장 제4조(추측 금지)·제7장 제1조(Spec 없는 기능 추가 금지)·제7장 제3조(임의 비즈니스 로직 생성 금지)에 따라 구현하지 않는다.
  - **선행 조치 필요**: 기획 AI가 (a) 공공/무료·유료/민간·기타를 구분하는 판별 기준(예: `is_free` 필드만으로 충분한지, 별도 `provider_type` 컬럼이 필요한지), (b) 할인 예매 "제휴 딥링크"의 실제 데이터 소스(Decision 008의 커머스 핫딜 API 연동 항목과의 관계), (c) 버튼 라벨/노출 조건을 `spec/event/event-detail.md`·`spec/space/space-detail.md`에 명문화하는 Spec 갱신을 먼저 진행해야 한다.
