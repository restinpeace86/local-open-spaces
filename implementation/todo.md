
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[🎯 신규 진행 Task 목록]** 중 미완료 Task를 순차적으로 구현하고 결과를 하단 보고서에 작성하세요.
> **작업 착수 전 필수 실행**: 최신 명세(`spec/ui/space-card.md` 뱃지 규칙 및 `spec/data/ai-rule.md` 메인 히어로 규칙 등) 반영을 위해 반드시 `git pull`을 먼저 수행하세요.

---

## 🎯 [신규] 차기 진행 Task 목록

- [x] **[Task 1] `rgnCltrFcltExmnv1` (전국문화기반시설총람) 8개 시설 수집 어댑터 구현** (완료)
- [x] **[Task 4] 행정안전부 문화_테마파크업(기타) API 수집 어댑터 구현** (완료)
- [x] **[Task 5] 전국공공시설개방표준데이터 API 수집 어댑터 구현** (완료)
- [x] **[Task 2] 도시공원 수집 스크립트(city-parks.mjs) 최신 BaseCollectorAdapter 마이그레이션** (완료)
  - **산출물**: `scripts/ingest/adapters/city-park-adapter.mjs` (19,154건 실데이터 정상 수신 확인 완료)

- [x] **[Task 6] [내부 검증용] DB 적재 데이터 점검용 Admin Data Grid 구축 및 뱃지 규약 점검** (완료)
  - **라우트**: `/admin/data-grid` (개발자 전용 분리 라우트, Read-Only)
  - **확인 결과**:
    - `source_type`/`category` 다중 필터링, 키워드 검색(디바운스), 원문 `raw_data` JSON Viewer 모달/드로어(`raw-data-modal.tsx`) 정상 동작 확인.
    - `spec/space/space-card.md` 뱃지 규약과 일치: 필수 뱃지(`is_free`, `facility_type`, `target_age_group`) 및 보조 뱃지(`has_parking`, `is_kids_friendly`, `stroller_accessible`) 정상 표출.
    - `is_free === null`일 때 요금 뱃지 미노출(숨김) 처리 로직 정상 적용 확인.
  - **산출물**: `src/app/admin/data-grid/page.tsx`, `src/components/admin/data-grid-client.tsx`, `src/components/admin/raw-data-modal.tsx`, `src/app/api/admin/data-grid/route.ts`

- [ ] **[Task 7] data.go.kr 키즈 특화 공공 API 2종 추가 수집 어댑터 구현** 🔄 *(Task 6 완료 - 진행)*
  - **1) 행정안전부 전국어린이놀이시설정보 API**:
    - **목적**: 공공·마을 어린이 놀이터 전수 수집 및 `is_kids_friendly = true` 뱃지 자동화.
    - **API 명세 및 샘플 요청**:
      - **End Point 1 (시설 기본정보)**: `https://apis.data.go.kr/1741000/pfc3/getPfctInfo3`
        - 샘플: `apis.data.go.kr/1741000/pfc3/getPfctInfo3?serviceKey={인증키}&pageIndex=1&recordCountPerPage=10&pfctSn=999`
      - **End Point 2 (놀이기구 정보)**: `https://apis.data.go.kr/1741000/ride4/getRide4`
        - 샘플: `apis.data.go.kr/1741000/ride4/getRide4?serviceKey={인증키}&pageIndex=1&recordCountPerPage=10&pfctNm=만월어린이공원%20놀이터&instlPlaceCd=A003&operYnCd=B001&prvtPblcYnCd=C002&rideStylCd=D001&dutyCd=Q002&idrodrCd=O002&rideInstlBgngYmd=20241007&rideInstlEndYmd=20241007&rgnNm=인천광역시%20남동구%20구월동&pfctSn=999`
    - **산출물**: `scripts/ingest/adapters/playground-adapter.mjs` 및 단위 테스트
  - **2) 전국장난감도서관표준데이터 API**:
    - **목적**: 지자체 영유아 실내 놀이실 및 장난감 대여소 스팟 확보.
    - **산출물**: `scripts/ingest/adapters/toy-library-adapter.mjs` 및 단위 테스트

---

## 🚫 [기존 기능명세서 충돌 및 스킵 로그]

- **[Task 7-1] 전국어린이놀이시설정보 API (`getPfctInfo3`, `getRide4`) 스킵 (2026-08-21)**
  - **사유**: `PUBLIC_DATA_API_KEY`로 두 엔드포인트(`apis.data.go.kr/1741000/pfc3/getPfctInfo3`, `apis.data.go.kr/1741000/ride4/getRide4`)를 지시서 샘플 파라미터 그대로 실제 호출한 결과 둘 다 HTTP 403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 수신. `URLSearchParams`로 서비스키를 정상 인코딩(`+` → `%2B`)했음에도 동일 오류가 재현되어, 과거 `amusement-park-adapter` 5차 세션에서 확인된 "수동 인코딩 누락으로 인한 오탐"과는 다른 **실제 미승인 상태**로 판단. 이 서비스는 data.go.kr에서 API별 개별 활용신청 승인이 필요해(과거 Task 4/5와 동일 패턴), 승인 전에는 실 응답 스키마를 확인할 수 없어 `transform()` 필드 매핑을 추측으로 작성하지 않음(CLAUDE.md 제3장 제4조 추측 금지).
  - **필요 조치**: data.go.kr에서 "전국어린이놀이시설정보" API(`getPfctInfo3`/`getRide4`) 활용신청 승인 후 재시도.
- **[Task 7-2] 전국장난감도서관표준데이터 API 스킵 (2026-08-21)**
  - **사유**: `implementation/todo.md` 작업 지시서에 이 API의 Base URL/Endpoint가 명시되어 있지 않음. data.go.kr 표준데이터 목록에서 "장난감도서관"을 웹 검색했으나 정확히 일치하는 공식 API를 확인하지 못함(유사 표준데이터인 `전국도서관표준데이터`(`tn_pubr_public_lbrry_api`)와는 별개 데이터셋으로, 동일시해 임의 대체할 수 없음). Endpoint를 추측해 구현할 경우 CLAUDE.md 제3장 제4조(추측 금지) 및 제7장 제3조(임의 비즈니스 로직 생성 금지) 위반이므로 스킵.
  - **필요 조치**: 정확한 data.go.kr 데이터셋명 또는 Base URL/Endpoint를 작업 지시서에 명시해줄 것.

---

## 📋 [완료 및 히스토리 Log]

### 1. 완료된 작업
- [x] `rgnCltrFcltExmnv1` 8개 시설 수집 어댑터 구현 완료.
- [x] `전국공공시설개방표준데이터` 수집 어댑터 구현 및 단위 테스트 통과.
- [x] `행정안전부 문화_테마파크업(기타)` 어댑터 구현 완료 (`amusement-park-adapter.mjs`).
- [x] 레거시 도시공원 수집 스크립트 최신 `BaseCollectorAdapter` 구조 마이그레이션 완료 (`city-park-adapter.mjs`, 19,154건).
- [x] DB 적재 데이터 점검용 Admin Data Grid 구축 및 뱃지 규약(필수 3종 + 보조 3종, `is_free===null` 숨김) 점검 완료.
