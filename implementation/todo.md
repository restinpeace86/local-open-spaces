
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

- [x] **[Task 6] [내부 검증용] DB 적재 데이터 점검용 Admin Data Grid 구축 및 UI 버그 수정** 🔄
  - **라우트**: `/admin/data-grid`
  - **🚨 긴급 수정 지시**:
    - 현재 테이블 행(Row)에서 뱃지가 최대 1개만 보이는 UI 버그 수정.
    - `has_parking`, `stroller_accessible`, `is_kids_friendly` 3개 조건이 모두 `true`인 경우, `flex-wrap gap-1` 배치를 적용하여 **한 행에 복수 개의 뱃지(최대 3개)가 모두 나란히 표출**되도록 UI 렌더링 로직 수정.
  - **작업 지시**:
    - `source_type` 다중 필터링, 검색 바, `raw_data` JSON Viewer 모달/드로어 작동 검증.
---

## 📋 [완료 및 히스토리 Log]

### 1. 완료된 작업
- [x] `rgnCltrFcltExmnv1` 8개 시설 수집 어댑터 구현 완료.
- [x] `전국공공시설개방표준데이터` 수집 어댑터 구현 및 단위 테스트 통과.
- [x] `행정안전부 문화_테마파크업(기타)` 어댑터 구현 완료 (`amusement-park-adapter.mjs`).
- [x] 레거시 도시공원 수집 스크립트 최신 `BaseCollectorAdapter` 구조 마이그레이션 완료 (`city-park-adapter.mjs`, 19,154건).
- [x] `[Task 6]` Admin Data Grid 뱃지 UI 버그 수정: `has_parking`/`stroller_accessible`/`is_kids_friendly` 뱃지를 `flex-wrap gap-1` 컨테이너의 개별 칩으로 렌더링해 3개 모두 동시 노출되도록 수정 (`data-grid-client.tsx`). `source_type` 다중 필터, 검색 바(ilike, 300ms 디바운스), `raw_data` JSON 뷰어 모달/바텀시트 동작 코드 검증 완료(정상).
