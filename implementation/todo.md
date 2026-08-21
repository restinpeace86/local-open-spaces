
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
- [x] **[Task 7] 행정안전부 전국어린이놀이시설정보 API(`getPfctInfo3`) 수집 어댑터 구현** (완료, 2026-08-21)
  - **목적**: 공공·마을 어린이 놀이터 전수 수집 및 `is_kids_friendly = true` 뱃지 자동화.
  - **연결 확인**: `PUBLIC_DATA_API_KEY`(일반 인증키)로 `getPfctInfo3` 실 호출 결과 정상 연결 확인(resultCode `00` NORMAL SERVICE, 전량 85,291건 수신 → 유효 스키마 변환 82,373건).
  - **산출물**: `scripts/ingest/adapters/playground-adapter.mjs`, `scripts/ingest/adapters/playground-adapter.test.mjs`(단위 테스트 10건 통과), `scripts/ingest/playground.mjs`(CLI), `package.json`의 `ingest:playground` 스크립트.
  - **End Point 2 (`getRide4`, 놀이기구 정보) 미통합 사유**: `pfctSn` 단위 개별 호출은 정상 동작함을 확인했으나, `open_spaces` 스키마에 시설 1건당 놀이기구 N건을 저장할 컬럼이 없어(스키마 변경은 임의 결정 금지 대상) 8만여 시설 전체에 대한 N+1 추가 호출은 근거 없는 과잉 구현으로 판단해 미통합. 상세 판단 근거는 `playground-adapter.mjs` 파일 상단 주석 참조.

---

## 📋 [완료 및 히스토리 Log]

### 1. 완료된 작업
- [x] `rgnCltrFcltExmnv1` 8개 시설 수집 어댑터 구현 완료.
- [x] `전국공공시설개방표준데이터` 수집 어댑터 구현 및 단위 테스트 통과.
- [x] `행정안전부 문화_테마파크업(기타)` 어댑터 구현 완료 (`amusement-park-adapter.mjs`).
- [x] 레거시 도시공원 수집 스크립트 최신 `BaseCollectorAdapter` 구조 마이그레이션 완료 (`city-park-adapter.mjs`, 19,154건).
- [x] DB 적재 데이터 점검용 Admin Data Grid 구축 및 뱃지 규약(필수 3종 + 보조 3종, `is_free===null` 숨김) 점검 완료.
- [x] 행정안전부 전국어린이놀이시설정보(`getPfctInfo3`) 수집 어댑터 구현 및 단위 테스트 통과 (`playground-adapter.mjs`, 실데이터 85,291건 → 유효 82,373건 변환 확인).
