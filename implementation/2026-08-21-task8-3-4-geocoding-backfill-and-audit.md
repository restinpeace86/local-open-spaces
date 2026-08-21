# Task 8-3(지오코딩 백필) + Task 8-4(서울/경기 데이터 정밀 검증)

## 구현 대상
- Task 8-3: `GgEventsAdapter`에 VWorld Geocoder pacing/재시도 적용 및 DB 좌표 NULL 레코드 백필
- Task 8-4: 서울시(`seoul-culture-events.mjs`, `SeoulYeyakAdapter`) + 경기도(`GgEventsAdapter`) 전체 데이터의 스키마 완결성/뱃지 정확성/카테고리 태깅/중복 방지 정밀 검증

## 구현 일시
2026-08-21

---

## Task 8-3: 지오코딩 백필

### DB 내 기존 NULL 좌표 레코드 확인
`open_spaces`/`events` 양쪽 다 `location IS NULL` 레코드 0건 실측 확인. `buildOpenSpaceRow`/`buildEventRow`가 lng/lat 없는 행을 upsert 이전에 걸러내는 구조라(제5장 제5조), 애초에 좌표 NULL 레코드가 DB에 존재할 수 없다 — "백필 대상 없음"이 정확한 답이며, 실질 작업은 `GgEventsAdapter` 신규 수집분의 좌표 확보였다.

### Pacing/재시도 구현
- `scripts/ingest/adapters/gg-events-adapter.mjs`: `geocodeOrSkip()`에 250ms pacing + 지수 백오프 재시도(최대 3회) 추가
- 1차 실행(pacing 없음): VWorld 서버 자체의 간헐적 502/연결거부로 1,304/1,305건 실패(요청 속도 문제가 아님을 실측으로 확인 — 200ms 간격도 20/20 실패, 5초 간격 단일 재시도도 실패)
- pacing+재시도 적용 후 재실행: 1,201/1,305건 성공 (103건은 ROAD/PARCEL 모두 정당한 NOT_FOUND)

### 부수 발견: upsert 배치 실패
원본 `TBWTRWTRPLYHYDRDTAM`에 완전히 동일한 시설명+주소 레코드가 2건 중복 등재 → 동일 `external_id`(SHA1 해시)가 같은 batch에 두 번 들어가 Postgres가 `ON CONFLICT DO UPDATE command cannot affect row a second time`로 배치 전체를 거부. 공용 `upsertRows()`(`scripts/ingest/lib/supabase-admin.mjs`)에 `external_id` 기준 중복 제거(마지막 값 우선)를 추가해 근본 해결 — 특정 어댑터가 아니라 모든 어댑터에 적용되는 일반적 보호로 배치했다. 단위 테스트 5건(`supabase-admin.test.mjs` 신설).

### 최종 결과
`open_spaces` GG_EVENTS 소스 1,199건 실제 upsert 완료 (중복 external_id 0건 재확인).

---

## Task 8-4: 서울/경기 데이터 정밀 검증

### 검증 방법
세 소스(GG_EVENTS/SEOUL_YEYAK/SEOUL_CULTURE) 전량을 실제 DB에서 페이지네이션 전수 조회(`.range()` 반복)해 컬럼별 NULL 건수, 중복 external_id, category/event_type 분포, is_free/is_kids_friendly/facility_type 분포를 직접 집계했다. 임시 감사 스크립트로 확인 후 삭제(영구 코드 아님).

### 발견 및 수정한 문제

**1. `seoul-culture-events.mjs` 완결성 심각한 미달** — `main()`이 `fetchCultureEvents({ startIdx: 1, endIdx: 20 })`를 페이지네이션 없이 단발 호출해, `list_total_count`(실측 19,508건) 중 20건만 DB에 있었다. `project/data_sources.md`에는 이 소스가 "구현 완료"로 기록돼 있었으나 실제로는 0.1%만 커버하고 있었던 것 — 전체를 끝까지 순회하는 `fetchAllCultureEvents()`로 교체했다(1,000건/페이지, 실제 호출로 상한 확인).

**2. 같은 파일의 Gemini 동시 호출 폭주** — `Promise.all(items.map(...))`이 19,508건을 한꺼번에 처리하면서, 규칙표(`SEOUL_CODENAME_MAP`)에 없는 CODENAME(표본 2,000건 기준 8.65%, 약 1,687건 추정)마다 Gemini를 동시에 최대 수천 건 호출해 `HTTP 429`가 연쇄적으로 발생, 대부분이 `ETC`로 낙하하고 있었다. 순차 처리(for-of)로 교체했다. 완전히 해소되지는 않았음(아래 잔여 한계 참고).

**3. `seoul-culture-events.mjs`의 `is_free` 전량 미설정** — `deriveParentalTags`는 `is_free`를 계산하지 않는데, 반환 객체 어디에도 `is_free`가 없어 DB 컬럼 기본값(`false`)으로 18,961건 전부가 "유료"로 저장되고 있었다. 원본에 실제 `IS_FREE`('유료'/'무료') 필드가 있음을 확인(표본 1,000건 무료 비율 65.1%) — 원본 필드를 그대로 반영하도록 수정(`item.IS_FREE === '무료' ? true : item.IS_FREE === '유료' ? false : null`).

**4. `SeoulYeyakAdapter`의 뱃지 필드 전량 미설정** — `is_kids_friendly`/`has_parking`/`stroller_accessible`/`facility_type`/`target_age_group`이 `buildEventRow` 호출에 전혀 전달되지 않아 2,527건 전체가 기본값에 머물러 있었다(예: DIV="체육시설" 590건 중 실제 아동 대상 프로그램이 섞여 있어도 전부 `is_kids_friendly=false`). 원본 `USETGTINFO`(이용대상, 예: "가족(학부모 1인, 자녀 1인)")/`DTLCONT`(상세내용) 텍스트를 근거로 하는 `deriveParentalTags`(seoul-culture-events.mjs가 이미 쓰던 함수와 동일)를 연결했다. 기존 테스트 파일이 없었던 것도 확인해 `seoul-yeyak-adapter.test.mjs` 11건을 신설했다.

### `is_free` 오탐 발견 및 정정 (`GgEventsAdapter`)
Task 8-2/8-3에서 "PublicSwimmingPool의 소유기관 전수가 공공기관"이라는 실측 근거로 `is_free=true`를 소스 레벨 고정했었다. 재검토 결과 이 예외(ai-rule.md 5.2-7)는 "공공 소유=무료"가 실제로 성립하는 시설(공원/광장/놀이터 등)에만 유효하며, 수영장은 공공 소유라도 국내 관행상 거의 예외 없이 유료 시설이다(구립/시립 수영장, 국민체육센터 수영장 등 통상 자유수영 1회 3,000~6,500원). "공공기관이 운영한다"와 "무료로 이용 가능하다"를 혼동한 오탐으로 판단해 `null`(정보 미기재)로 정정했다.

### DB 스키마 제약 불일치 발견 및 수정
문제 3번 수정을 반영하려는 과정에서 `events.is_free`에 `NOT NULL` 제약이 있어(문서에는 미기재) `is_free: null` 저장 시 배치 전체가 실패하는 것을 발견했다. `spec/space/space-card.md`는 `is_free === null`을 "정보 미기재/알 수 없음 → 요금 뱃지 숨김"으로 명시적으로 정의하고, `open_spaces.is_free`는 이미 NULL을 허용한다 — 두 테이블 간 불일치는 의도된 설계가 아니라 스펙과 어긋난 제약이라고 판단해 `scripts/migrations/2026-08-21-events-is-free-nullable.sql`(`ALTER TABLE events ALTER COLUMN is_free DROP NOT NULL`)을 적용하고 `project/database_schema.md`를 정정했다.

### 최종 실측 결과 (수정 반영 후 전수 재조회)
| 소스 | 건수 | is_free (true/false/null) | is_kids_friendly (true/false) | 주요 category/event_type 분포 | 중복 external_id |
| --- | --- | --- | --- | --- | --- |
| GG_EVENTS (open_spaces) | 1,199 | 1,075 / 0 / 124 | 1,075 / 124 | OUTDOOR_NATURE 1,075, KIDS_ACTIVITY 124 | 0 |
| SEOUL_YEYAK (events) | 2,708 | 1,192 / 1,516 / 0 | 1,036 / 1,672 | PERFORMANCE_FESTIVAL 1,077, KIDS_ACTIVITY 596, EXPERIENCE_CLASS 425, ETC 610(의도됨) | 0 |
| SEOUL_CULTURE (events) | 18,961 | 12,242 / 6,713 / 6 | 4,070 / 14,891 | PERFORMANCE 6,291, POPUP 6,274, EXHIBITION 3,156, FESTIVAL 999, ETC 2,241 | 0 |

## 검증 (validation loop)
- 신규/수정 테스트: `supabase-admin.test.mjs`(5건 신설), `gg-events-adapter.test.mjs`(12건, is_free 기대값 수정), `seoul-yeyak-adapter.test.mjs`(11건 신설)
- `npx tsc --noEmit` / `npm run test`(전체 100/100) / `npm run build`: 모두 통과

## 잔여 한계 (백로그, 이번 범위에서 추가 조치 안 함)
`SEOUL_CULTURE`의 `ETC` 2,241건 중 상당수는 Gemini 무료 티어 요청 한도로 추정되는 잔여 `429` 실패분이다(순차 처리로 바꾼 뒤에도 완전히 해소되지 않음). `ai-rule.md` 4.1이 "AI 불확실 시 임의 생성 대신 ETC로 낙하"를 명시적으로 허용하므로 스펙 위반은 아니나, 완전히 해소하려면 Gemini 호출 사이에 명시적 지연(pacing)을 추가해 19,508건 전체를 다시 순회해야 하고 이는 수 시간 단위 실행 시간이 예상돼 이번 세션 범위에서는 진행하지 않았다. 필요 시 별도 지시로 재개 가능.
