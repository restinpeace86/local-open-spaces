
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [x] **[Task 8-2] 경기데이터드림(data.gg.go.kr) 수집 어댑터 연동 및 실측 검증** 완료 (2026-08-21)
  - **수집 대상**:
    1. 공공 수영장 (`PublicSwimmingPool`): 135건 정상 확인 (`INFO-000`)
    2. 물놀이형 수경시설 (`TBWTRWTRPLYHYDRDTAM`): 1,170건 정상 확인 (`INFO-000`)
  - **검증 성과**:
    - `User-Agent` 브라우저 헤더를 통한 WAF 보안 차단 우회 성공.
    - 소유기관(`POSESN_INST_NM`) 검증으로 `is_free` 오탐 방지 로직 적용.
    - 키워드 매핑 `matchesKidsKeyword`를 `ai-tagging.mjs` 공통 유틸리티로 통합 모듈화.
    - 전체 필드 실측 결과 좌표 필드 부재 확인 ➔ 지오코더 연동 레이어 준비.
  - **산출물**: `scripts/ingest/adapters/gg-events-adapter.mjs` 및 `gg-events-adapter.test.mjs` (83/83 단위 테스트 통과)

- [ ] **[Task 8-3] 지오코더 기반 좌표 미지정 데이터 일괄 변환 및 DB 백필 (Backfill)** 🔄
  - **대상**: `GgEventsAdapter` (수영장 135건, 수경시설 1,170건) 및 DB 내 좌표(`latitude`, `longitude`) NULL 레코드 전체
  - **작업 지시**:
    - VWorld Geocoder 2.0 (`process.env.VWORLD_API_KEY`) 적용.
    - VWorld 502/Rate Limit 방지를 위한 요청 지연(Pacing) 및 ROAD ➔ PARCEL Fallback 로직 적용.
    - 주소-좌표 일괄 변환 수행 후 DB Upsert 완료.

- [ ] **[Task 8-4] 서울시/경기도 공공데이터 표준화 컬럼, 뱃지, 카테고리 정밀 검증** 🔄
  - **대상 데이터**: 서울시 (`seoul-culture-events.mjs`, `SeoulYeyakAdapter`) 및 경기도 (`GgEventsAdapter`) 수집 데이터 전체
  - **검증 항목**:
    - DB 표준 스키마 컬럼 규약 준수 여부
    - `spec/ui/space-card.md` 뱃지 규약 (`is_free`, `is_kids_friendly`) 오탐 여부
    - 서비스 표준 카테고리 체계 자동 태깅 완결성
    - `external_id` 해시 키 기반 중복 적재 방지 상태
