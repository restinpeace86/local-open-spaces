
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [x] **[Task 8-2] 경기데이터드림(data.gg.go.kr) 수집 어댑터 구현 및 실행**
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
  - **산출물**: `scripts/ingest/adapters/gg-events-adapter.mjs` 및 `gg-events-adapter.test.mjs`
  - **실제 호출 검증**: 두 서비스 ID(`PublicSwimmingPool`, `TBWTRWTRPLYHYDRDTAM`) 모두 User-Agent 헤더로 WAF 우회 후 `INFO-000` 정상 응답 확인(각각 135건/1,170건). Task 8-2 1차 스킵의 원인이던 `Cultrsttus`/`Pubchefltswim`은 잘못된 서비스 ID였음이 이번 정확한 ID로 확인됨.
  - **좌표 없음 → 지오코딩 필수(실측 발견)**: 두 API의 전체 필드를 실측 확인한 결과 위경도 필드가 전혀 없어(주소 텍스트만 제공) `NationalParkEcotourAdapter`와 동일하게 Kakao 지오코딩이 필수. `KAKAO_REST_API_KEY`가 아직 `.env.local`에 없어 실제 upsert는 대기 상태(어댑터/테스트는 완성, `--dry-run` 실행 시 명확한 에러로 정상 종료 확인).
  - **`is_free`(API1) 근거**: 135건 전수의 `POSESN_INST_NM`(소유기관)을 실측 확인한 결과 35개 기관 모두 시/군청·국민체육진흥공단·대한장애인체육회 등 공공/준공공 기관으로, 민간 사업자가 전혀 없어 소스 레벨 공공 확정 근거로 `is_free=true` 고정.
  - **`is_kids_friendly`/`facility_type` 공용화**: `swimming-pool-adapter.mjs`(Task 7-3)에 있던 `matchesKidsKeyword`를 `lib/ai-tagging.mjs`로 옮겨 공용화(두 어댑터가 동일 키워드 목록 사용, 중복 방지). 회귀 검증으로 `swimming-pool-adapter.test.mjs` 26/26 재통과 확인.
  - **UI 카테고리**: `project/data_sources.md` 2.3에 이미 기록된 매핑을 그대로 적용 — 수영장(API1)은 🎡 키즈·액티비티, 물놀이터·바닥분수(API2)는 🌳 야외·자연(신규 판단 아님, 기존 Spec 그대로 적용).
  - **검증**: `gg-events-adapter.test.mjs` 11/11 통과, `npx tsc --noEmit`/`npm run test`(전체 83/83)/`npm run build` 모두 통과.
