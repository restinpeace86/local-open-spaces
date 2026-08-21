
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [ ] **[Task 8-2] 경기데이터드림(data.gg.go.kr) 수집 어댑터 구현 및 실행** 🔄
  - **환경변수**: `GG_DATA_API_KEY`
  - **요청 필수 규약**: WAF 차단 방지를 위한 `User-Agent` 브라우저 헤더 필수 포함
  - **공통 URL 파라미터**: `?KEY={GG_DATA_API_KEY}&Type=json&pIndex=1&pSize=100`
  - **수집 대상 API (2종)**:
    1. **공공 수영장**: `https://openapi.gg.go.kr/PublicSwimmingPool`
    2. **물놀이형 수경시설(바닥분수/물놀이터)**: `https://openapi.gg.go.kr/TBWTRWTRPLYHYDRDTAM`
  - **작업 지시**:
    - `fetch` 요청 시 `headers: { 'User-Agent': 'Mozilla/5.0 ...' }` 적용.
    - JSON 파싱 후 `open_spaces` 스키마 변환.
    - 바닥분수/물놀이터는 기본적으로 `is_kids_friendly = true`, `is_free = true` 매핑.
    - `SHA1(시설명|주소)` 기반 `external_id` 중복 방지 처리.
  - **산출물**: `scripts/ingest/adapters/gg-events-adapter.mjs` 및 `seoul-events-adapter.test.mjs` (또는 `gg-events-adapter.test.mjs`)
