# 📋 [TODO] TourAPI 4.0 데이터 적합성 검토 및 매핑 분석

## 📌 배경 및 목적
우리가 최근 공공데이터포털(data.go.kr)에서 신청한 **한국관광공사 TourAPI 4.0 관련 4개 API**(`국문 관광정보 서비스`, `무장애 여행`, `고캠핑`, `반려동물 동반여행`)가 **우리 서비스의 핵심 목적**에 얼마나 부합하는지 분석하고 사전 매핑 전략을 수립한다.

* **우리 서비스의 핵심 목적**: *"오늘/이번 주말에 아이와 뭐하고 놀지? 가성비 좋은 곳 없나? 오늘 할 만한 행사/이벤트 없나?"*
* **주의사항**: **코드나 DB 스키마/컬럼을 직접 수정/변경하지 말고**, 오직 기존 코드베이스 분석 및 TourAPI 명세 비교 결과를 본 `todo.md` 하단에 **[분석 결과 보고서]** 형태로 업데이트할 것.
* **주의사항**: 현재 상위 제약 문서들과 충돌이 발생하거나 미흡할 수 있는 부분에 대하여, 어느 기능명세서에 대하여 수정이 필요할지에 대하여 하단에 **[기존 기능명세서 충돌 위험]** 형태로 업데이트할 것.

---

## 🎯 검토 및 분석 요구사항 (체크리스트)

### 1. 데이터 분류 및 유효성 검토 (Relevance)
- [x] TourAPI의 `contentTypeId`(12:관광지, 14:문화시설, 15:축제/공연/행사, 28:레포츠 등) 중 우리 서비스 목적(가성비 놀거리, 행사/축제, 박물관/체험)에 부합하는 필터링 조건 정의
- [x] "오늘/이번 주말 진행 중인 행사"를 추출하기 위한 일자 데이터(`eventstartdate`, `eventenddate`) 관리 및 필터링 가능 여부 확인

### 2. API 연동성 및 호출 구조 검토 (Connectivity)
- [x] 현재 프로젝트의 수집 어댑터 구조에서 TourAPI 4.0 Endpoints(지역기반/위치기반/행사정보/상세정보 등) 연결 적합성 평가
- [x] 필수 상세 정보(입장료, 주차 여부, 유모차 가능 여부 등)를 얻기 위한 추가 API 호출(`detailIntro`, `detailWithSign` 등) 필요성 및 N+1 호출 최소화 방안 검토

### 3. 기존 데이터 규약/컬럼 매핑 분석 (Schema Mapping)
- [x] 기존 프로젝트에 정의된 데이터 스키마/컬럼(5대 카테고리, 4대 뱃지, 위치, 운영시간, 요금 등)과 TourAPI 응답 필드 간 일치율 분석
- [x] 무료/유료 판단, Outlink URL, 좌표 데이터 등 변환이 까다롭거나 누락 가능성이 있는 항목 식별 및 처리 방안 제시

---

## 📝 [Claude 분석 결과 작성 구역]

> 분석 시점(2026-08-21) 기준, 본 `todo.md`가 검토를 요청한 4개 API(국문 관광정보/무장애 여행/고캠핑/반려동물 동반여행)는 이미 각각 `KorTourAdapter`/`KorWithTourAdapter`/`GoCampingAdapter`/`KorPetTourAdapter`로 **구현·실제 upsert 검증까지 완료**되어 있다(`project/data_sources.md` 2.4절, 최근 커밋 `1012a2d`/`b5853f0` 등). 본 분석은 코드/스키마를 새로 만들지 않고, **이미 구현된 4개 어댑터의 실제 동작이 서비스 목적에 부합하는지, 그리고 어떤 갭이 남아 있는지**를 코드 기준으로 검증한 결과다.

### 1. 서비스 목적 대비 TourAPI 4.0 데이터 적합성 평가
- 4개 API는 모두 `contentTypeId` 12(관광지)/14(문화시설)/28(레포츠)만 수집하도록 범위가 좁혀져 있고(`GoCamping`은 전용 캠핑장 스키마), 결과는 전부 `public.open_spaces`(상시 존재하는 "공간형" 데이터)에 적재된다. 즉 이 4개 소스는 서비스 목적 중 **"가성비 놀거리/체험 공간 발견"** 축에는 직접 부합하지만, **"오늘/이번 주말 행사"**(시한성 이벤트) 축에는 기여하지 않는다.
- "오늘/이번 주말 진행 중인 행사" 요구는 이 4개 API가 아니라 `contentTypeId=15`(축제/공연/행사)를 다루는 **기존 소스 #06**(`scripts/ingest/tour-api-festival.mjs`, `searchFestival2` 오퍼레이션)이 이미 전담하고 있으며, `eventstartdate`/`eventenddate`를 `start_date`/`end_date`로 파싱해 `public.events`에 적재하는 구조가 이미 구현·가동 중이다(`project/data_sources.md` 2.2 #06). 4개 API 소스는 사용자 확정 지시(2026-08-20)에 따라 `contentTypeId=15`(숙박/음식점/쇼핑과 함께)를 **의도적으로 제외**한다(`project/data_sources.md` 2.4절 `KorPetTourAdapter`/`KorWithTourAdapter` 비고).
- 결론: 4개 API의 서비스 목적 적합성은 "공간 발견" 관점에서 **적합**하며 이미 구현이 완료된 상태다. "행사 발견" 관점은 이 4개 API의 책임 범위가 아니며 별도 소스가 이미 커버하므로 **중복 구현 불필요**.

### 2. 카테고리 & 콘텐츠 필터링 전략 (`contentTypeId` ➔ 기존 5대 카테고리)
- `TourApiV4AreaBasedAdapter`(`scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`)가 `KorService2`/`KorWithService2`/`KorPetTourService2` 3개 서비스의 공통 베이스로, `areaBasedList2` 오퍼레이션을 `contentTypeId`별로 페이지네이션 호출한다.
- 카테고리 매핑(`kor-tour-adapter.mjs` 등 3개 어댑터 공통): `12(관광지) → OUTDOOR_NATURE(🌳 야외·자연)`, `14(문화시설) → EXHIBITION_MUSEUM(🏛️ 전시·박물관)`, `28(레포츠) → KIDS_ACTIVITY(🎡 키즈·액티비티)`. `spec/data/ai-rule.md` 3.3의 5대 UI 카테고리 매핑표와 정합.
- `GoCampingAdapter`는 `contentTypeId` 개념이 없는 별도 응답 스키마(`basedList`, `facltNm`/`mapX`/`mapY` 등 카멜케이스)라 분기 없이 전량 `OUTDOOR_NATURE`로 고정 매핑(캠핑장은 정의상 전부 야외 시설).
- `KorTourAdapter`/`KorWithTourAdapter`/`KorPetTourAdapter`는 같은 `contentid` 네임스페이스를 공유함이 실제 호출로 확인되어(예: "전주드림랜드" contentid 중복), `KOR_TOUR_API_V4_{contentid}` 단일 `external_id`로 통합해 upsert 시 자연 중복제거되도록 마이그레이션까지 완료됨(`scripts/migrations/2026-08-21-cleanup-tour-api-v4-legacy-ids.sql`).

### 3. 기존 DB 스키마 vs TourAPI 응답 필드 매핑 테이블 (`open_spaces` 기준)
| 기존 DB 컬럼 | TourAPI 응답 필드 | 일치/변환 여부 | 비고/주의사항 |
| :--- | :--- | :--- | :--- |
| `title`(→`name`) | `title` | 일치 | - |
| `category` | `contenttypeid` | 변환(매핑표 경유) | `contentTypeId → UI_CATEGORY` 매핑(위 2번 항목). `GoCamping`은 고정값 |
| `address` | `addr1` | 일치 | 원문 그대로 저장, 정제 없음 |
| `latitude`/`longitude`(→`location`) | `mapx`/`mapy`(TourAPI v4), `mapX`/`mapY`(GoCamping) | 일치(필드명 케이스만 상이) | `contentid`/`title`/좌표 중 하나라도 없으면 해당 행 자체를 skip(`transform()` 내 null guard) |
| `external_id` | `contentid`(TourAPI v4 3종, 통합 네임스페이스), `contentId`(GoCamping) | 변환 | `KOR_TOUR_API_V4_{contentid}` / `GO_CAMPING_{contentId}` 접두어 부여 |
| `is_free` | (해당 없음 — `areaBasedList2`/`basedList` 응답에 요금 필드 없음) | **미매핑 → 항상 `null`** | 상세 조회(`detailIntro2` 등) 미호출로 요금 필드 자체가 없음. 운영주체가 민관 혼재라 `ai-rule.md` 5.2-7 "국공립 무료 추정" Fallback도 코드 주석상 의도적으로 미적용(추측 금지 원칙 준수) — **다만 4절 참고: 프론트 뱃지 표시 시 `null`이 "유료"로 오인 표시되는 리스크 있음** |
| `is_kids_friendly`/`has_parking`/`stroller_accessible` | (해당 없음 — 두 오퍼레이션 모두 태깅 근거 텍스트를 상세 필드로 제공하지 않음) | **미매핑 → 항상 기본값**(`false`/`false`/`false`) | `scripts/ingest/lib/ai-tagging.mjs`의 `deriveParentalTags()`(키워드 기반 결정적 태깅 함수)가 이미 존재하지만 4개 어댑터 모두 호출하지 않음. `raw_data`(JSONB)에는 원본 `overview` 등 텍스트가 통째로 보관되어 있어 추후 태깅 자체는 기술적으로 가능 |
| `info_url` | (TourAPI v4 3종은 필드 없음), `resveUrl`/`homepage`(GoCamping) | 부분 매핑 | TourAPI v4 3종은 항상 `null`, GoCamping만 예약/홈페이지 URL 매핑 |
| `facility_type` | (해당 없음) | 미매핑 → 기본값 `'복합'`(GoCamping은 `'야외'` 고정) | `normalizeFacilityType()` 기본값 경로 |
| `raw_data` | 응답 아이템 전체 | 일치 | 원본 보존 — 향후 상세 태깅 재처리 시 재사용 가능 |

### 4. 파이프라인 연동 시 고려사항 (호출 제한, N+1 문제, 데이터 정제)
- **N+1 미발생(의도적 설계):** `detailIntro2`/`detailWithSign2` 등 콘텐츠별 상세 API를 호출하지 않고 `areaBasedList2`/`basedList`의 목록 응답만으로 적재한다. 콘텐츠 건수(TourAPI v4 통합 19,148건 + GoCamping 3,087건 ≈ 2.2만 건) 대비 상세 호출을 1건씩 추가하면 호출량이 배 이상 늘어나므로, 현재는 입장료·주차·유모차 정보를 **아예 수집하지 않는 방식**으로 N+1을 회피하고 있다. 트레이드오프: 정확도(상세 정보 없음) vs 호출 비용/속도.
- **페이지네이션:** 두 어댑터 계열 모두 `numOfRows=100` 고정 페이지 크기로 `totalCount`까지 순차 호출(rate limit 제어 로직은 없음 — 현재 데이터 규모에서는 문제 발생 이력 없음).
- **카테고리 태깅 파이프라인 미적용:** 3절에서 확인했듯 `ai-tagging.mjs`의 `deriveParentalTags()`가 기존 소스(#06 `tour-api-festival.mjs`)에는 적용되어 있으나, 정작 이번 4개 신규 어댑터에는 연결되어 있지 않다. `raw_data`에 원문이 보존되어 있으므로 기술적으로는 재처리 가능하나, 이는 기존 어댑터 코드 수정이 필요한 사항이라 본 분석에서는 실행하지 않고 5절 Action Item으로만 남긴다(코드 미변경 원칙).
- **`is_free: null`의 프론트 표시 리스크(신규 발견):** `src/lib/spaces/parental-badges.ts`의 `getSpaceBadges()`가 `item.is_free ? '🎁 무료' : '유료'`로 분기하는데, `null`은 JS에서 falsy이므로 **요금 정보를 전혀 모르는 상태(null)가 "유료"로 확정 표시된다.** 4개 API 데이터는 전량 `is_free: null`이므로, 사실상 요금을 알 수 없는 관광지/문화시설/레포츠 시설이 화면에는 전부 "유료"로 노출되는 부작용이 있다. 이는 아래 [기존 기능명세서 충돌 위험]에 별도 기재.

### 5. 검토 완료 후 실행할 단계별 TODO (Action Items)
*(승인 전까지 착수하지 않음 — Decision 008 패턴과 동일하게 개별 승인 후 별도 구현 작업으로 진행)*
- [x] `parental-badges.ts`(및 `quick-filters.ts` 등 `is_free`를 참조하는 다른 화면 로직)에서 `is_free === null`(정보 없음)과 `is_free === false`(유료 확정)를 구분해서 표시할지 기획 AI 확인 필요 — Spec 없는 UI 변경이므로 임의 구현 금지
- [ ] `deriveParentalTags()`를 `TourApiV4AreaBasedAdapter.transform()`/`GoCampingAdapter.transform()`에 연결해 `raw_data.overview` 등 원문 기반으로 `is_kids_friendly`/`has_parking`/`stroller_accessible`/`facility_type`을 재태깅할지 여부 — 기존 어댑터 로직 변경이므로 별도 승인 필요
- [ ] `detailIntro2`(입장료 등) 상세 API 연동 필요성 재검토 — 현재는 N+1 회피를 위해 미호출 중이며, 붙일 경우 캐싱/배치 전략(예: 신규 `contentid`만 상세 호출) 설계 선행 필요

> **2026-08-21 세션 스킵 로그:** 위 3개 Action Item은 자율 하네스 실행(제0조 사전 준수 확인) 결과, 항목 본문에 명시된 "승인 전까지 착수하지 않음 / 임의 구현 금지 / 별도 승인 필요" 홀드 표시와 Decision 008(개별 승인 후 별도 구현) 패턴에 상충하여 이번 세션에서 구현하지 않고 스킵함. 기획 AI 승인 및 별도 Spec 확정 후 재개할 것.

> **2026-08-21 세션 재개 로그(2차):** 기획 AI가 `spec/space/space-card.md`를 직접 갱신(커밋 `a61bed4`)하여 `is_free` 뱃지의 `true`/`false`/`null` 3분기 표시 규칙(`null`은 뱃지 숨김)을 명문화함에 따라, 위 Action Item 1번의 홀드 사유("Spec 없는 UI 변경이므로 임의 구현 금지")가 해소됨. 이를 근거로 제0조 사전 준수 재확인 후 `src/lib/spaces/parental-badges.ts`의 `getSpaceBadges()`만 신규 Spec에 맞춰 구현 완료(공간 카드 한정 — `spec/event/event-card.md`는 변경되지 않았으므로 `getEventBadges()`는 기존 로직 유지). `quick-filters.ts`의 `isFree()`는 이미 `is_free === true`만 매칭하고 있어 수정 불필요함을 확인. Action Item 2/3번은 여전히 별도 승인 필요 상태로 스킵 유지.

---

## 🚧 [기존 기능명세서 충돌 위험]
- **`spec/space/space-card.md`(Parental Checkpoint Badges) vs 실제 데이터:** 스펙은 `is_free` 뱃지를 무료/유료 이분법으로 정의하나, TourAPI 4.0 계열 4개 소스(19,148+3,087건)는 운영주체 혼재로 `is_free`를 구조적으로 `null`(알 수 없음)만 가질 수 있다. 현재 프론트(`parental-badges.ts`)는 `null`을 falsy 처리해 "유료"로 표시하므로, **실제로는 요금을 모르는 시설을 사용자에게 "유료"라고 단정적으로 보여주는 정보 오류**가 발생한다. `is_free` 뱃지에 "정보없음" 상태를 추가할지는 Spec 변경 사안이라 기획 AI 확인이 필요하다(임의 구현 금지, 제7장 제1조).
