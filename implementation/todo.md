
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

- [ ] **[Task 7-3] 전국 수영장(공공+민간 인허가) 통합 수집 어댑터 구현** 🔄
  - **목적**: 체육진흥공단(공공/구립) + 행안부(인허가/민간·키즈풀) 2개 API를 통합 수집하여 전국 수영장 전수 확보 및 `is_kids_friendly` / `facility_type = '수영장'` 뱃지 자동화.
  - **인증키 이중 검증 지시 (중요)**:
    - 환경변수 `PUBLIC_DATA_API_KEY` (디코딩 키: `Dk9DCSP5I...`) 사용을 기본으로 하되, 403/Key 에러 발생 시 웹 명세 인코딩 키(`Dk9DCSP5I7NQpXu6oRMjAlvZzXbEV%2BQzpX3q%2BHENSX90w4AXExCGmOU9drYKSzEbiZdaz%2BF0htDLVj7k6gQP1A%3D%3D`)를 인코딩 없이 전송하는 폴백(Fallback) 방식을 모두 테스트/시도할 것.
  - **API 1 (체육진흥공단 - 공공/체육센터)**:
    - Endpoint: `https://apis.data.go.kr/B551014/SRVC_API_SFMS_FACI/TODZ_API_SFMS_FACI`
    - Params: `serviceKey`, `pageNo`, `numOfRows`, `resultType=json`, `ftype_nm=수영장`
  - **API 2 (행정안전부 - 인허가/민간/키즈풀)**:
    - Endpoint: `https://apis.data.go.kr/1741000/swimming_pools/info`
    - Params: `serviceKey`, `pageNo`, `numOfRows`, `returnType=json`
  - **작업 지시**:
    - 두 API 수집 결과를 병합하고 시설명+주소 기준 중복 식별 처리.
    - `spec/ui/space-card.md` 뱃지 규약 준수 (`facility_type = '수영장'`, `is_kids_friendly` 매핑, `is_free = null` 오탐 방지).
  - **산출물**: `scripts/ingest/adapters/swimming-pool-adapter.mjs` 및 `swimming-pool-adapter.test.mjs`
