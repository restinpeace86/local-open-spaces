
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

- [ ] **[Backlog] SEOUL_CULTURE 카테고리 재태깅 (Gemini Pacing 적용)** ⏳
  - **현상**: Gemini AI Free Tier Rate Limit(429)으로 인해 SEOUL_CULTURE 2,241건 중 일부가 `ai-rule.md 4.1` 규약에 따라 `ETC` 카테고리로 Fallback 처리됨.
  - **대응 방안**: 추후 필요 시 Gemini API 호출 간 명시적 지연(Pacing: e.g. 1~2초) 및 Exponential Backoff 재시도 로직을 적용하여 전수 재태깅 백필(Backfill) 진행 예정.
  - **우선순위**: Low (현 규약상 스펙 준수 상태이며, 서비스 동작에 지장 없음)

- [x] **[Task 9-1] 하단 5탭 내비게이션 + 홈 화면(야놀자/여기어때 스타일) 신규 구현** 완료 (2026-08-22)
  - **보류 해제 근거**: 사용자가 화면 목업/우선순위를 명시적으로 확정 지시(2026-08-22) — `project/overview.md` "신규 확장 목표"의 하단 5탭/홈 화면 항목을 "확정"으로 갱신함.
  - **라우팅 재구성**: 기존 `/`(지도)를 `/nearby`로, `/region`·`/calendar`를 `(explore)` 라우트 그룹(`src/app/(explore)/`) 안으로 이동. `/`(신규 홈)이 새 디폴트가 됨. 기존 상단 3탭(`TopTabs`)은 폐기하지 않고 `(explore)/layout.tsx`로 옮겨 지도/도감/캘린더 사이의 서브 내비게이션으로 유지(Decision 008 "기존 뷰는 폐기가 아니라 재배치").
  - **산출물**:
    - `src/lib/home/get-home-feed.ts`(`getTodayEvents`/`getFreeFeed`/`getHomeFeed`) + `src/app/api/home/feed/route.ts` + `src/app/page.tsx`(Server Component, 같은 로직 공유)
    - `src/components/home/{home-header,home-sub-tabs,hero-carousel,quick-category-grid,home-view}.tsx`
    - `src/components/cards/event-card.tsx`(신규 — 기존엔 이벤트 전용 카드가 없었음), `src/components/region/space-grid-card.tsx`(거리 표시 + emphasis 뱃지 지원 추가)
    - `src/components/nav/bottom-tabs.tsx`(신규 5탭), `src/lib/feature-flags.ts`(신규 — `spec/common/feature-flags.md` 구현체가 이전엔 스펙 문서만 있고 실제 코드가 없었음)
    - `src/lib/spaces/category-meta.ts`에 `UI_CATEGORY_FILTER_OPTIONS`(5대 UI 카테고리, docs/spec.md 3.2 순서) 추가
  - **[찜]/[마이] 탭 처리**: Decision 003(찜 비노출)·마이페이지 인증 시스템 부재로 `FEATURE_FLAGS.ENABLE_USER_BOOKMARK`/`ENABLE_MY_PAGE`(기본 false)로 비활성화 표시(숨김이 아니라 회색 비활성 — 탭 구조는 5개 고정 유지, spec/common/feature-flags.md 원칙)
  - **[특가·핫딜] 서브탭**: 커머스 API(쿠팡 파트너스/네이버 쇼핑) 자체가 미착수·미보유라 실제 데이터가 전혀 없음 — 가짜 데이터로 채우지 않고 탭을 비활성화 처리(추측 금지)

  - **`docs/spec.md`/DB 실제 컬럼 Mismatch 발견 (지시 #6)**:
    1. **`booking_status` 표시 문구 불일치**: DB 실제 저장값(`scripts/ingest/lib/ai-tagging.mjs`의 `deriveBookingStatus`)은 `'오늘방문'`/`'D-1 마감임박'`/`'접수중'`/`null`인데, `event-card.md`/`docs/spec.md`가 요구하는 표시 문구는 "오늘 당일 입장 가능" 등 풀 문구다. 기존 프론트 코드(`parental-badges.ts`)는 원본값을 그대로 노출해(예: "⚡ 오늘방문") 스펙과 어긋나 있었음 — 원본값→스펙 문구 매핑(`BOOKING_STATUS_LABEL`)을 추가해 수정. `'주말예약'`은 실제 ETL이 만들지 않는 값이라 매핑에서 제거했고, 스펙의 "📅 사전 예약 필수" 상태는 ETL이 별도로 구분해 생성하지 않아(예약 필수 + D-1 아님 = 그냥 `'접수중'`) 매핑 없이 원본값을 그대로 노출.
    2. **event 카드 `is_free` null 오탐 (실제 버그, 수정함)**: `parental-badges.ts`의 `getEventBadges()`가 `is_free === null`을 `false`(유료)와 동일하게 취급해 요금 미기재 이벤트를 "유료"로 오표시하고 있었다 — space 카드는 이미 null 숨김 처리가 돼 있었는데 event 카드만 빠져 있던 것. `is_free: null` 레코드가 실제로 존재함(SEOUL_CULTURE 6건, Task 8-4 참고)을 근거로 space와 동일하게 null 숨김으로 수정.
    3. **`events` 테이블에 장소(venue) 컬럼이 없음**: `event-card.md`/Hero Carousel 스펙 모두 "장소" 표시를 요구하나, `events` 테이블에는 장소명 텍스트 컬럼이 아예 없고 `space_id` FK도 실측 결과 **전체 이벤트 중 0건**만 채워져 있어(실제 쿼리로 확인) 사실상 어떤 이벤트도 FK로 장소명을 끌어올 수 없다. 홈 화면은 거리 정보가 있으면 거리를, 없으면 "장소 정보 없음"을 정직하게 표시하도록 구현(가짜 장소명 생성 안 함). 장소명을 채우려면 ETL 단에서 원본 API의 장소 필드(PLACENM 등, 현재 `raw_data`에는 있지만 컬럼화 안 됨)를 새 컬럼으로 뽑아내는 별도 작업이 필요 — 이번 범위 밖으로 남김.
    4. **`docs/spec.md` 3.2의 가성비 3단계(완전무료/1만원 이하/유료)가 구현 불가**: 스펙은 "💰 1만원 이하" 중간 단계를 요구하나 두 테이블 모두 `is_free` BOOLEAN만 있고 실제 숫자 요금(`price_krw` 등) 컬럼이 없다 — 대부분의 어댑터가 애초에 숫자 요금을 수집하지 않음(원문에 없거나 텍스트로만 존재). 현재는 무료/유료 2단계만 정확히 구현 가능. 3단계 구현은 요금 데이터 수집 자체를 확장해야 하는 별도 과제.
    5. **`/region`(카테고리 탭) 필터 칩이 5대 UI 카테고리를 몰랐음**: `SPACE_CATEGORY_FILTER_OPTIONS`가 레거시 카테고리(`PARK`/`SPORTS`/`CULTURE`)만 나열해, 홈 Quick 그리드에서 `?category=KIDS_ACTIVITY`로 진입해도 실제 필터링(데이터 조회)은 정상 동작하지만 필터 칩 UI에는 어떤 칩도 "선택됨"으로 표시되지 않는다. `RegionGridView`가 URL의 `category` 파라미터를 초기값으로 읽도록 연동해 필터링 자체는 정상 동작하게 만들었으나(`docs/spec.md` 2.2 "클릭 시... 즉시 필터링" 충족), 칩 UI 자체를 5대 카테고리까지 넓히는 것은 더 큰 범위라 이번엔 하지 않음(추후 필요).

  - **검증**:
    - `npx tsc --noEmit` / `npm run test`(전체 112/112, 신규 20건: HomeView 5건 + parental-badges EVENT 8건 + 기존 space 6건 등) / `npm run build`: 모두 통과
    - `npm run dev` 기동 후 `/`, `/nearby`, `/region`, `/calendar`, `/api/home/feed` 전체 HTTP 200 확인, 서버 로그에 에러/경고 없음, `/api/home/feed` 실제 DB 데이터 응답 확인, 각 페이지 SSR HTML에 기대 문구(예: "0원의 행복", "카테고리", "내주변" 등) 존재 확인
    - **한계**: 이 세션 환경에는 Playwright 등 실제 브라우저 자동화 도구가 없어(CLAUDE.md 제5장 제8조가 요구하는) 클릭/캐러셀 스크롤/이미지 로딩 등 인터랙티브 동작의 육안 확인은 못 했다 — HTTP 상태 코드/SSR HTML 내용/서버 로그 기반 확인까지만 완료. 사용자가 직접 브라우저로 한 번 확인하는 것을 권장.
