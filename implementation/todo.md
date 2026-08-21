
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [x] **[Task 5] 전국공공시설개방표준데이터 API 수집 어댑터 구현**
  - **Base URL**: `https://api.data.go.kr/openapi/tn_pubr_public_pblfclt_opn_info_api`
  - **주요 작업**:
    - `type=json` 요청 및 `open_spaces` 스키마 매핑 (`source_type='PUBLIC_FACILITY_OPEN'`)
    - 이용요금 텍스트 파싱을 통한 `is_free` 정밀 판별
    - Vworld 지오코더 연동 및 `deriveParentalTags()` 3대 육아 뱃지 태깅
    - /tn_pubr_public_pblfclt_opn_info_api?serviceKey=Dk9DCSP5I7NQpXu6oRMjAlvZzXbEV%2BQzpX3q%2BHENSX90w4AXExCGmOU9drYKSzEbiZdaz%2BF0htDLVj7k6gQP1A%3D%3D&pageNo=1&numOfRows=100&type=json 이거 했을때는 됐는데 이걸로 다시 한번해봐 data.go.kr 쪽의 인증키 받은거 .env.local에 이미있고 .TourAPI4.0꺼랑 동일한 인증키쓰고 있어
  - **산출물**: `scripts/ingest/adapters/public-facility-open-adapter.mjs` 및 단위 테스트
  - **완료 (2026-08-21)**: 제시된 서비스키로 `curl` 직접 호출해 재확인한 결과 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 해소되고 `resultCode: "00"`(NORMAL SERVICE)로 실 데이터(7,329건)를 정상 수신함 — 이전 2회 스킵 로그의 1번 블로커(서비스키 미승인)는 해결됨. 응답 필드(`openFcltyNm`/`rdnmadr`/`pchrgUseYn`/`rntfee`/`latitude`/`longitude` 등)를 실제로 확인한 뒤에만 매핑 코드를 작성함(추측 금지 준수). 2번 블로커였던 `VWORLD_API_KEY` 미설정은 이번 응답에 `latitude`/`longitude`가 원본 필드로 직접 포함되어 있음을 확인해 우회함 — go-camping-adapter(mapX/mapY)와 동일하게 원본 좌표를 그대로 사용하고 Vworld 지오코딩은 호출하지 않음(좌표가 없는 cultural-facility-summary-adapter와는 데이터 특성이 달라 Spec 취지에 부합). `openFcltyType`(축구장/체육관/다목적경기장 등)은 `spec/data/ai-rule.md` 3.1 `SPORTS` → 3.3 매핑표의 🎡 키즈·액티비티(`KIDS_ACTIVITY`)로 분류. 원본에 시설 고유 ID가 없어 `local-data-kids-adapter`와 동일하게 기관코드+시설명+주소 해시를 `external_id`로 사용. `npm run ingest:public-facility-open` CLI 및 `scripts/ingest/adapters/public-facility-open-adapter.test.mjs` 단위 테스트(페이지네이션/에러 응답/`is_free` 판별/좌표 누락 스킵/뱃지 태깅) 추가. `tsc`/`test`/`build` 검증 통과 후 커밋·푸시함.
