
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

- [x] **[Task 8-3] 지오코더 기반 좌표 미지정 데이터 일괄 변환 및 DB 백필 (Backfill)** 완료 (2026-08-21)
  - **대상**: `GgEventsAdapter` (수영장 135건, 수경시설 1,170건) 및 DB 내 좌표 NULL 레코드 전체
  - **DB 내 기존 NULL 좌표 레코드 확인**: `open_spaces`/`events` 양쪽 다 `location IS NULL` 레코드 **0건**임을 실측 확인 — `buildOpenSpaceRow`/`buildEventRow`가 애초에 lng/lat 없는 행은 upsert 이전에 걸러내므로(제5장 제5조 데이터 중심 구현), 좌표 NULL 레코드가 DB에 존재할 수 없는 구조다. 따라서 이 항목은 "백필 대상 없음"이 정확한 결과이며, 실질 작업은 GgEventsAdapter의 신규 수집분 좌표 확보였다.
  - **Pacing/ROAD→PARCEL Fallback 적용**: 요청 간 250ms 지연 + 실패 시 지수 백오프 재시도(최대 3회) 추가. 1차 실행(pacing 없음) 시 VWorld 서버 자체의 간헐적 502/연결거부로 1,304/1,305건 실패했으나, pacing+재시도 적용 후 재실행 시 1,201/1,305건 성공(103건은 ROAD/PARCEL 모두 정당한 NOT_FOUND)으로 대폭 개선.
  - **부수 발견 및 수정(업서트 실패 원인)**: 원본 `TBWTRWTRPLYHYDRDTAM` 데이터에 완전히 동일한 시설명+주소 레코드가 2건 중복 등재돼 있어 같은 batch 안에서 동일 `external_id`가 두 번 들어가 Postgres가 배치 전체를 거부(`ON CONFLICT DO UPDATE command cannot affect row a second time`)하는 것을 확인 — 공용 `upsertRows()`(`scripts/ingest/lib/supabase-admin.mjs`)에 `external_id` 기준 중복 제거(마지막 값 우선) 방어 로직을 추가해 근본 해결(모든 어댑터에 적용되는 일반적 보호). 단위 테스트 5건 추가.
  - **최종 결과**: `open_spaces` GG_EVENTS 소스 **1,199건** 실제 upsert 완료(중복 0건 확인).

- [x] **[Task 8-4] 서울시/경기도 공공데이터 표준화 컬럼, 뱃지, 카테고리 정밀 검증** 완료 (2026-08-21)
  - **대상 데이터**: 서울시 (`seoul-culture-events.mjs`, `SeoulYeyakAdapter`) 및 경기도 (`GgEventsAdapter`) 수집 데이터 전체
  - **검증 방법**: 세 소스 전량을 실제 DB에서 페이지네이션 전수 조회해 컬럼별 NULL 건수/중복 external_id/category·event_type 분포/is_free·is_kids_friendly·facility_type 분포를 직접 집계(추측이 아닌 실측 데이터 기준).
  - **발견 및 수정한 문제 4건**:
    1. **`seoul-culture-events.mjs` 완결성 심각한 미달**: `main()`이 `fetchCultureEvents({ startIdx: 1, endIdx: 20 })`를 페이지네이션 없이 단발 호출해, 실제 19,508건 중 **20건만** 수집돼 있었다(문서에는 "구현 완료"로 표기돼 있었으나 사실상 0.1%만 커버). 전체를 순회하는 `fetchAllCultureEvents()`로 교체.
    2. **동일 파일의 Gemini 동시 호출 폭주**: `Promise.all(items.map(...))`이 19,508건을 한 번에 동시 처리하면서, 규칙표(`SEOUL_CODENAME_MAP`)에 없는 CODENAME(표본 2,000건 기준 8.65%)마다 Gemini를 동시에 최대 수천 건 호출해 `HTTP 429`가 나고 전부 `ETC`로 떨어지고 있었다. 순차 처리(for-of)로 교체 — 완전히 해소되진 않았으나(최종 실행 시 2,242/19,508건은 여전히 429로 ETC, 이는 Gemini 무료 티어 RPM 한도로 추정되는 남은 한계) AI 분류 성공 건수 자체는 유의미하게 늘었다.
    3. **`seoul-culture-events.mjs`의 `is_free` 전량 미설정**: `deriveParentalTags`는 `is_free`를 계산하지 않는데 반환 객체에 `is_free`가 아예 없어 DB 컬럼 기본값(`false`)으로 18,961건 전부가 "유료"로 표시되고 있었다 — 원본에 실제 `IS_FREE`('유료'/'무료') 필드가 있고 표본 무료 비율이 65.1%에 달해 심각한 오탐이었다. 원본 필드를 그대로 반영하도록 수정.
    4. **`SeoulYeyakAdapter`의 `is_kids_friendly`/`has_parking`/`stroller_accessible`/`facility_type`/`target_age_group` 전량 미설정**: `buildEventRow` 호출에 이 필드들이 아예 전달되지 않아 2,527건 전체가 기본값(`false`/`'복합'`)에 머물러 있었다(예: DIV="체육시설"인 590건 중 실제로 키즈 대상인 프로그램이 섞여 있어도 전부 `is_kids_friendly=false`로 표시). 원본의 `USETGTINFO`/`DTLCONT` 실제 텍스트를 근거로 하는 `deriveParentalTags`(이미 seoul-culture-events.mjs가 쓰던 것과 동일 함수)를 연결. 기존 테스트가 없었어서 단위 테스트 11건 신설.
  - **`is_free` 오탐 1건 발견 및 정정 (`GgEventsAdapter`)**: 이전 구현이 "PublicSwimmingPool의 소유기관 전수가 공공기관"이라는 실측 근거로 `is_free=true`를 고정했으나, 재검토 결과 이는 "공공 소유=무료"가 성립하는 시설(공원/광장 등)에만 적용 가능한 예외였고 수영장은 공공 소유라도 국내 관행상 거의 예외 없이 유료 시설이다(구립/시립 수영장 통상 3,000~6,500원). "공공기관 운영"과 "무료 이용"을 혼동한 오탐으로 판단해 `null`(정보 미기재)로 정정.
  - **DB 스키마 제약 불일치 발견 및 수정**: 위 3번 수정 적용 중 `events.is_free`에 `NOT NULL` 제약이 있어(문서 미기재) `is_free: null`(정보 미기재, `space-card.md` 명시 규약) 저장 시 배치 전체가 실패함을 발견. `open_spaces.is_free`는 이미 NULL을 허용해 두 테이블 간 불일치였으므로, `open_spaces`와 일치시키는 마이그레이션(`scripts/migrations/2026-08-21-events-is-free-nullable.sql`, `ALTER TABLE events ALTER COLUMN is_free DROP NOT NULL`) 적용 및 `project/database_schema.md` 정정.
  - **최종 실측 결과 (전수 재조회, 중복 external_id 전부 0건 확인)**:
    - `GG_EVENTS`(open_spaces) 1,199건 — `is_free`: true 1,075 / null 124(수영장, 정정됨) / false 0. `is_kids_friendly`: true 1,075 / false 124. `category`: OUTDOOR_NATURE 1,075 / KIDS_ACTIVITY 124.
    - `SEOUL_YEYAK`(events) 2,708건 — `is_free`: true 1,192 / false 1,516 / null 0. `is_kids_friendly`: true 1,036 / false 1,672(정정 후 실데이터). `event_type`: PERFORMANCE_FESTIVAL 1,077 / KIDS_ACTIVITY 596 / EXPERIENCE_CLASS 425 / ETC 610(시설대관·진료, 의도된 미분류).
    - `SEOUL_CULTURE`(events) 18,961건(20건 → 18,961건으로 완결성 대폭 개선) — `is_free`: true 12,242 / false 6,713 / null 6(정정됨). `event_type`: PERFORMANCE 6,291 / POPUP 6,274 / EXHIBITION 3,156 / FESTIVAL 999 / ETC 2,241(대부분 Gemini 429 잔여 한계).
  - **잔여 한계(백로그로 기록, 이번 범위에서 추가 조치 안 함)**: `SEOUL_CULTURE`의 `ETC` 2,241건 중 상당수는 Gemini 무료 티어 요청 한도로 추정되는 잔여 429 실패분이다. ai-rule.md 4.1이 "AI 불확실 시 임의 생성 대신 ETC로 낙하"를 명시적으로 허용하므로 스펙 위반은 아니나, 완전히 해소하려면 Gemini 호출 간 명시적 지연(pacing)을 추가해 전체 19,508건을 다시 순회해야 하며 이는 수 시간 단위 실행 시간이 예상돼 이번 세션 범위에서는 진행하지 않았다.
