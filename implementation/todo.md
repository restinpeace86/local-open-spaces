
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [ ] **[Task 5] 전국공공시설개방표준데이터 API 수집 어댑터 구현**
  - **Base URL**: `https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api`
  - **주요 작업**:
    - `type=json` 요청 및 `open_spaces` 스키마 매핑 (`source_type='PUBLIC_FACILITY_OPEN'`)
    - 이용요금 텍스트 파싱을 통한 `is_free` 정밀 판별
    - Vworld 지오코더 연동 및 `deriveParentalTags()` 3대 육아 뱃지 태깅
  - **산출물**: `scripts/ingest/adapters/public-facility-open-adapter.mjs` 및 단위 테스트
  - **스킵 (2026-08-21)**: 착수 전 `PUBLIC_DATA_API_KEY`로 Base URL(`https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api?serviceKey=...&pageNo=1&numOfRows=5&type=json`)에 실제 조회를 시도한 결과 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30, "등록되지 않은 서비스키", HTTP 403)가 반환됨. 혹시 Base URL 자체의 호스트/경로 표기 문제인지 확인하기 위해 `apis.data.go.kr` 변형과 `api.data.go.kr/openapi/service/rest/...` 변형으로도 재시도했으나, 전자는 동일한 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`, 후자는 `NO_OPENAPI_SERVICE_ERROR`(returnReasonCode 12, 폐기/부재)만 반환되어 URL 오기가 아니라 서비스키 활용신청 미승인 문제로 확인됨. 이는 Task 1(`rgnCltrFcltExmnv1`)·Task 4(`amusement_facilities_other`)가 반복 스킵됐던 것과 동일한 유형의 블로커임. 추가로 `.env.local`에 `VWORLD_API_KEY` 자체가 아직 설정되어 있지 않아, 서비스키 승인이 나더라도 지오코딩 단계에서 다시 막히는 이중 블로커 상태임. 실 응답을 단 한 번도 수신하지 못한 상태에서 필드명(사업장명/주소/이용요금/좌표 필드가 무엇인지)을 임의로 추정해 매핑 코드를 작성하는 것은 `CLAUDE.md` 제3장 제4조(추측 금지) 및 `spec/data/ai-rule.md` 4.1(임의 추측 금지)에 정면으로 위배되어 스킵함. **필요 조치 (관리자)**: (1) data.go.kr에서 "전국공공시설개방표준데이터" API에 대해 `PUBLIC_DATA_API_KEY` 활용신청을 승인 처리, (2) Vworld 오픈API(www.vworld.kr) 신청 후 `.env.local`에 `VWORLD_API_KEY` 추가. 두 조치가 모두 완료되면 Task 1/4와 동일한 패턴(`BaseCollectorAdapter` + `buildOpenSpaceRow` + `deriveParentalTags()` + Vworld 지오코더)으로 즉시 착수함.
  - **스킵 유지 재확인 (2026-08-21, 2차 세션)**: 신규 세션 착수 시 사전 준수 확인 절차에 따라 Base URL에 동일 조회를 재시도한 결과 여전히 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 반환됨을 확인. `.env.local`에도 `VWORLD_API_KEY`가 여전히 미설정 상태로 확인되어 이중 블로커 상태에 변화 없음. 관리자 조치(서비스키 활용신청 승인, VWORLD_API_KEY 발급/설정) 전까지 임의 추정 매핑 구현은 계속 보류함. `npx tsc --noEmit`, `npm run test`(15 passed), `npm run build` 모두 재검증 통과.
