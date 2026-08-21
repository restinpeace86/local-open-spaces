
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [ ] **[Task 8-1] 서울열린데이터광장(data.seoul.go.kr) 실시간 행사/예약 수집 어댑터 구현** 🔄
  - **환경변수**: `SEOUL_DATA_API_KEY`
  - **API 1 (서울시 문화행사)**:
    - Base URL: `http://openAPI.seoul.go.kr:8088/{SEOUL_DATA_API_KEY}/json/SeoulCulturalEvents/{START_INDEX}/{END_INDEX}/`
  - **API 2 (서울시 공공서비스예약 문화체험)**:
    - Base URL: `http://openAPI.seoul.go.kr:8088/{SEOUL_DATA_API_KEY}/json/ListPublicReservationCulture/{START_INDEX}/{END_INDEX}/`
  - **작업 지시**:
    - 페이징 단위 1,000건 설정 (`1/1000/`, `1001/2000/` ...).
    - 서울시 고유 에러 코드(`INFO-000`, `INFO-200` 등) 예외 처리.
    - `open_events` 스키마 변환, 키워드 기반 `is_kids_friendly` 정밀 판단 및 `SHA1(이름|주소)` 기반 `external_id` 중복 방지.
    - `spec/ui/space-card.md` 뱃지 규약 적용 (`is_free` 오탐 방지).
  - **산출물**: `scripts/ingest/adapters/seoul-events-adapter.mjs` 및 `seoul-events-adapter.test.mjs`
