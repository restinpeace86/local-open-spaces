
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
## 🎯 [신규] 차기 진행 Task 목록

- [x] **[Task 1] `rgnCltrFcltExmnv1` (전국문화기반시설총람) 8개 시설 수집 어댑터 구현** (완료)
- [x] **[Task 4] 행정안전부 문화_테마파크업(기타) API 수집 어댑터 구현** (완료)
- [x] **[Task 5] 전국공공시설개방표준데이터 API 수집 어댑터 구현** (완료)
- [x] **[Task 2] 도시공원 수집 스크립트(city-parks.mjs) 최신 BaseCollectorAdapter 마이그레이션** (완료)
  - **구현 산출물**: `scripts/ingest/adapters/city-park-adapter.mjs` 및 단위 테스트
  - **특징**: `CITY_PARK_${manageNo}` 연속성 유지, `OUTDOOR_NATURE` 매핑, 파이프라인 및 GitHub Actions 워크플로우 전면 갱신.

- [x] **[Task 6] [내부 검증용] DB 적재 데이터 점검용 Admin Data Grid 구축** (완료)
  - **구현 산출물**: `src/app/admin/data-grid/page.tsx`, `src/app/api/admin/data-grid/route.ts`, `src/components/admin/data-grid-client.tsx`, `src/components/admin/raw-data-modal.tsx`
  - **특징**: `source_type`/카테고리 다중 필터(DB 실값 기반, 하드코딩 없음), 3대 육아 뱃지 및 `is_free` 3단 토글 필터, 시설명/주소 검색(300ms 디바운스), 페이지네이션(30건/페이지), 행 클릭 시 `raw_data` JSON 모달.
  - **참고**: Spec에 인증/권한 요구가 명시되지 않아 별도 로그인 게이팅은 구현하지 않음 (Decision 007의 `is_admin()` RBAC 인프라는 현재 마이그레이션에 실제로 존재하지 않아 적용 불가 — 필요 시 별도 Task로 분리 요망).

---

## 📋 [완료 및 히스토리 Log]

### 1. 완료된 작업
- [x] `rgnCltrFcltExmnv1` 8개 시설 수집 어댑터 구현 완료.
- [x] `전국공공시설개방표준데이터` 수집 어댑터 구현 및 단위 테스트 통과.
- [x] `행정안전부 문화_테마파크업(기타)` 어댑터 구현 완료 (`amusement-park-adapter.mjs`).
- [x] 레거시 도시공원 수집 스크립트 최신 `BaseCollectorAdapter` 구조 마이그레이션 완료 (`city-park-adapter.mjs`).
- [x] `/admin/data-grid` 내부 검증용 Read-Only Admin Data Grid 구축 완료 (`src/app/admin/data-grid/`, `src/app/api/admin/data-grid/route.ts`).
