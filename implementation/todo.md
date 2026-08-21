
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

- [ ] **[Task 4] 행정안전부 문화_테마파크업(기타) API 수집 & open_spaces 표준화 어댑터 구현**
  - **Base URL**: `https://apis.data.go.kr/1741000/amusement_facilities_other/info`
  - **주요 작업**:
    - `resultType=JSON` 파라미터 적용 및 영업중 상태코드 필터링.
    - `source_type='LOCALDATA_AMUSEMENT'` 기반 `open_spaces` 스키마 매핑.
    - 주소 기반 Vworld 지오코더 연동 및 `deriveParentalTags()` 3대 육아 뱃지 자동 태깅.
  - **산출물**: `scripts/ingest/adapters/amusement-park-adapter.mjs` 신규 작성 및 테스트 추가.
  - **스킵 (2026-08-21)**: 착수 전 `PUBLIC_DATA_API_KEY`로 Base URL(`https://apis.data.go.kr/1741000/amusement_facilities_other/info?serviceKey=...&pageNo=1&numOfRows=5&resultType=JSON`)에 실제 조회를 시도한 결과 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30, "등록되지 않은 서비스키")가 반환됨 — `resultType` 파라미터 유무와 무관하게 동일하게 발생해 파라미터 오류가 아닌 서비스키 활용신청 미승인 문제로 확인됨. 이는 Task 1(`rgnCltrFcltExmnv1`, 전국문화기반시설총람)이 8차 세션까지 반복 스킵됐던 것과 동일한 유형의 블로커이며, Task 1도 관리자가 data.go.kr에서 별도 활용신청을 승인한 뒤에야("2026-08-21 완료" 로그 참고) 실 데이터로 스키마를 검증하고 어댑터를 구현할 수 있었음. 현재 이 API는 실 응답을 단 한 번도 수신하지 못해 실제 JSON 필드명(사업장명/주소/좌표/영업상태 필드가 무엇인지)을 확인할 방법이 없고, 필드명을 임의로 추정해 매핑을 작성하는 것은 `CLAUDE.md` 제3장 제4조(추측 금지) 및 `spec/data/ai-rule.md` 4.1(임의 추측 금지)에 정면으로 위배됨. 따라서 검증되지 않은 스키마로 어댑터를 구현하지 않고 스킵함. **필요 조치 (관리자)**: data.go.kr에서 "행정안전부_문화_테마파크업(기타) 인허가 정보" API에 대해 `PUBLIC_DATA_API_KEY`(공공데이터포털 통합 인증키)의 활용신청을 승인 처리해줄 것. 승인 후 재실측이 확인되면 즉시 Task 1과 동일한 패턴(`BaseCollectorAdapter` + `buildOpenSpaceRow` + `deriveParentalTags()` + Vworld 지오코더)으로 착수함.
  - **스킵 유지 재확인 (2026-08-21, 2차 세션)**: `git pull` 결과 원격 변경 없음(`Already up to date`). Base URL에 동일한 파라미터로 재실측한 결과 여전히 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 반환 — 서비스키 활용신청 승인 상태에 변화 없음. `npx tsc --noEmit`, `npm run test`, `npm run build` 재검증 통과. 관리자 승인 전까지 스킵 유지.
