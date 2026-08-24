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

- [x] **[Task 9-6-11] 상세 페이지 조건부 예약 UI 및 링크 처리 정밀화** 🔗
  - **선행 조치 완료**: Decision 011 기록 및 `spec/space/space-detail.md`, `spec/event/event-detail.md` 3분류 CTA 명세 갱신 완료 (Spec 충돌 해소).
  - **세부 작업 지시**:
    1. **공공/무료 장소·행사** (`is_free=true` 또는 `reservation_url` 존재): `[🏛️ 공공 예약하기]` ➔ 공식 URL/지자체 예약 연동
    2. **유료/민간 제휴 장소·행사** (`is_free=false` 및 `affiliate_url` 존재): `[🎟️ 할인 예매하기]` ➔ 커머스 제휴 딥링크 연동
    3. **기타 장소·행사** (위 예약/예매 URL 미존재 시): `[🗺️ 길찾기]` ➔ 카카오맵/네이버지도/T맵 딥링크 연동
    4. **상세 모달 UI 및 예외 처리**: URL 누락/Null 처리 점검 및 테스트 패스(312/312) 패리티 유지.
  - **구현 완료 (2026-08-25)**: `src/components/map/detail-modal.tsx`에 3분류 조건부 CTA(단일 버튼) 로직 적용, `src/lib/spaces/get-nearby.ts`의 `NearbyItem`에 `affiliate_url?: string | null` 필드 추가.
    - **참고(범위 경계)**: `affiliate_url`을 채우는 커머스 제휴 API 연동(쿠팡 파트너스 등) 자체는 Decision 008 영향란 3번 항목으로 **별도 승인 대기 중인 미착수 과제**라 이번 Task 범위에 포함하지 않았다 — DB/RPC에 해당 컬럼이 없어 프론트엔드는 항상 `undefined`로 받고, 이 경우 CTA는 스펙대로 "길찾기"로 자연 폴백한다. DB 컬럼 추가/RPC 확장은 제5장 제3조(DB 구조 임의 변경 금지)에 따라 별도 Decision 없이 이번 Task에서 임의로 진행하지 않았다.
    - `src/components/map/detail-modal.test.tsx`에 조건부 CTA 3분류 케이스(공공 예약/할인 예매/길찾기 폴백/CTA 없음) 테스트 추가.
