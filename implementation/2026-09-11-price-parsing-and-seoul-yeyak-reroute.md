# 가격 정보 파싱 고도화(개선사항7-1) + SEOUL_YEYAK 체육/공간시설 재라우팅(개선사항9, Decision 024) — Step 115

## 개선사항7-1: 가격 정보 파싱 고도화

### 구현 대상
`implementation/todo.md` 개선사항7-1: "이벤트 원천 데이터의 텍스트(Description) 설명에서
가격 정보를 우선적으로 파싱. 유료로 추정되나 설명에 가격이 없고 원천 URL(source_url)이
있으면 크롤링 Fallback. 없으면 null. 15000원/성인 15000원 어린이 10000원처럼 유연하게 적재."

### 어댑터별 실측 조사 (사용자 요청 "어댑터별 조사해줘")
이벤트를 생산하는 4개 소스를 전부 직접 조사했다(raw_data 프로덕션 샘플 직접 조회 +
어댑터 코드 확인):

| 소스 | 가격 필드 | URL 필드 | 결론 |
| --- | --- | --- | --- |
| SEOUL_CULTURE_EVENTS | `USE_FEE`(이미 자유 텍스트로 존재, 예: "전석 10,000원 / 단체10인 이상 할인 20%") | `ORG_LINK`/`HMPG_ADDR` | 크롤링 불필요 — 기존 필드를 그대로 쓰면 됨 |
| GG_CULTURE_EVENTS API1 | `PARTCPT_EXPN_INFO`(참가비 정보, 예: "무료 (일부 재료비 별도)") | `HMPG_URL`/`URL` | 크롤링 불필요 |
| GG_CULTURE_EVENTS API2 | 없음(DTCONT 설명 텍스트만) | `ORIGIN_CONT` | 설명 텍스트 파싱으로 시도 |
| TOUR_API_FESTIVAL | 없음(searchFestival2/detailCommon2 전체 필드 확인, 가격 필드 자체가 없음) | `homepage`(detailCommon2, HTML 앵커) | 텍스트 파싱 대상 없음, URL만 확보 |
| SEOUL_YEYAK(seoul_public_reservation) | 없음(`PAYATNM`은 유료/무료 구분뿐) | `SVCURL`(이미 `reservation_url`로 저장 중) | 설명(DTLCONT) 파싱 시도 |

**URL 크롤링 Fallback 실측 검증**: 요구사항이 명시한 "원천 URL 크롤링"을 SEOUL_YEYAK의
실제 `SVCURL` 2건(영화촬영 대관/테니스장 예약)에 직접 fetch해 확인했다 — 정적 HTML에
가격이 전혀 없었다(날짜/시간대 선택 후 별도 API로 동적 로딩되는 구조로 추정). 이를
크롤링하려면 헤드리스 브라우저(Puppeteer 등, 이 프로젝트에 없는 무거운 신규 의존성)가
필요해 이번 범위에서 구현하지 않는다(제3장 제5조 추측 금지 — 안 되는 걸 되는 척
구현하지 않는다). 대신 원천 URL은 이미 `reservation_url`로 저장 중이라 별도 조치 불필요.

### 변경 사항
- **`scripts/migrations/2026-09-11-events-price-text-source-url.sql`**(적용 완료):
  `events.price_text text`, `events.source_url text` 컬럼 추가. 구조화 컬럼(정가/할인가
  등) 대신 자유 텍스트 하나로 둔다(요구사항 원문 "유연한 적재").
- **`scripts/ingest/adapters/lib/price-parser.mjs`**(신규) — `parsePriceFromText(text)`:
  1순위 "이용료/요금/참가비/입장료/사용료/수강료/관람료" 라벨 근처 금액, 2순위 라벨
  없이도 "대상어+금액"(최대 2개, 복수 요금 지원) 패턴. 못 찾으면 null(추측 금지).
- **4개 소스 갱신**:
  - `seoul-culture-events.mjs`: `price_text = USE_FEE`, `source_url = ORG_LINK || HMPG_ADDR`.
  - `gg-culture-events-adapter.mjs` API1: `price_text = PARTCPT_EXPN_INFO`("무료"뿐이면
    null, is_free와 중복 배제), `source_url = HMPG_URL || URL`. API2:
    `price_text = parsePriceFromText(DTCONT)`, `source_url = ORIGIN_CONT`.
  - `tour-api-festival.mjs`: 기존 `fetchOverview`(detailCommon2 개요만 추출)를
    `fetchDetail`로 확장해 같은 응답에서 `homepage`(HTML 앵커 태그)도 함께 추출 —
    추가 API 호출 없음. `price_text`는 확인된 필드가 없어 항상 null.
  - `seoul-yeyak-adapter.mjs`: `price_text = parsePriceFromText(DTLCONT)`.
    `source_url`은 별도 저장하지 않음(이미 `reservation_url`이 SVCURL과 동등).
- **`schema-mapper.mjs`**: `buildEventRow`에 `priceText`/`sourceUrl` 파라미터 추가 →
  `price_text`/`source_url` 컬럼 매핑.
- **유저 화면**: `NearbyItem`/`EVENT_COLUMNS`/`EventRow`/`toEventItem`에 두 필드 추가.
  `DetailModal` 이벤트 분기(Step 112의 8단 구조)에 "가격"(4단 기간 아래) / "홈페이지"
  (예약 안내 아래, "자세히 보기 ↗") dt/dd 행 추가 — 값이 없으면 행 자체를 숨긴다.

### 검증
- `price-parser.test.mjs`(신규 5건), `seoul-culture-events.test.mjs`(신규 5건, 이
  파일은 이전엔 테스트가 없었음), `tour-api-festival.test.mjs`(신규 4건, 마찬가지),
  `gg-culture-events-adapter.test.mjs`(+4건), `seoul-yeyak-adapter.test.mjs`(+2건),
  `detail-modal.test.tsx`(+3건).

---

## 개선사항9: SEOUL_YEYAK 체육시설/공간시설 open_spaces → events 재라우팅 (Decision 024)

### 배경
harness가 최초 1회 이 항목을 스킵하고 사유(Decision 017 2항과의 충돌)를
`implementation/todo.md`에 기록했다. 사용자가 스킵 사유를 확인한 뒤 명시적으로
재지시했다: **"이거는 open_spaces말고.. 다시 이벤트 테이블로."** — Decision 022의
선례(스킵 → 사용자 재확인 → 새 Decision으로 재승인)를 그대로 따라 **Decision 024**로
기록하고 진행한다(상세 조문은 `project/decision-log.md` Decision 024 참고).

### 변경 사항
- **`scripts/ingest/adapters/seoul-yeyak-adapter.mjs`**:
  - `MAXCLASSNM_TABLE`의 `체육시설`/`공간시설`을 `'open_spaces'` → `'events'`로 변경.
  - **부작용 방지**: 이 둘이 이제 문화체험/교육강좌와 같은 `if (table === 'events')`
    분기를 타면서 생길 뻔한 2가지 회귀를 명시적으로 막았다(`isSpaceLikeMaxClass` 플래그):
    1. UI 카테고리가 "체험·클래스"(EVENTS_UI_CATEGORY)로 잘못 붙지 않도록 이 둘은
       여전히 `uiCategory: null`(→ETC, 예전 open_spaces 시절과 동일) 유지.
    2. Decision 017 9항이 정한 "체육/공간시설은 좁은 키즈 판별(USETGTINFO/MINCLASSNM
       두 필드만)"이 넓은 텍스트 스캔(`broadTags.is_kids_friendly`)으로 되돌아가지
       않도록 `deriveSpaceKidsFriendly`를 계속 쓴다 — 이건 정확히 Decision 017 9항이
       고치려던 오매핑이라 재발을 막아야 했다.
  - 기존 `else`(buildOpenSpaceRow) 분기는 현재 도달 불가능해졌지만 삭제하지 않고
    주석으로 명시했다(제5장 제4조 — 향후 재분기 가능성/기존 테스트 이력 보존).
- **`project/decision-log.md`**: Decision 024 신규 기록(맥락/결정 내용/이유/영향).
- **`seoul-yeyak-adapter.test.mjs`**: 체육시설/공간시설 관련 8개 테스트를 `.open_spaces`
  → `.events` 기준으로 갱신 + UI 카테고리/키즈 판별 회귀 방지를 검증하는 신규
  단정 추가.

### 데이터 마이그레이션 (실행 완료)
- **`scripts/migrations/2026-09-11-migrate-seoul-yeyak-space-to-events.mjs`**(일회성,
  `--dry-run` 지원): 기존 `open_spaces`에 잘못 적재돼 있던 SEOUL_YEYAK 체육시설/
  공간시설 레코드를 재적재한다. 각 행의 `raw_data`(Decision 017 4항이 무손실
  보존해 둔 원본 API 응답)를 **실제 어댑터의 `transformSplit()`에 다시 통과시켜**
  (임의 컬럼 매핑 추측 없이 방금 고친 것과 동일한 로직 재사용) `events`에
  upsert한 뒤, `events` 반영이 확인된 다음에만 `open_spaces` 원본을 삭제한다
  (안전 순서 — 실패 시 원본이 그대로 남아 재시도 가능).
- **실측 결과**: dry-run으로 먼저 1,525건(체육시설 829 + 공간시설 696) 확인 후 실행.
  `events` upsert 1,525건 성공(6건은 좌표 파싱 실패로 `COORDINATE_PARSE_FAIL`
  집계됐지만 Decision 017 4항 원칙대로 드롭되지 않고 `UNKNOWN` 정밀도로 정상
  적재됨). DELETE가 최초 500건 단위 청크에서 `statement timeout`으로 실패해 50건
  단위로 줄이고 청크 사이 지연을 추가해 재시도, 최종적으로 `open_spaces` 원본
  1,525건 삭제 완료. **최종 확인**: `open_spaces`에서 해당 조건 행 0건, `events`에는
  2,655건(이번에 이관한 1,525건 + Decision 017 이전인 2026-08-19/20에 이미 events로
  적재됐던 기존 1,130건 — 그 시절엔 MAXCLASSNM 분리 자체가 없어 전량 events였음,
  created_at 타임스탬프로 직접 확인) — 오늘 재이관분과 충돌 없이 공존한다.

### 특이 사항
- 이 변경 이후 이벤트픽에 "테니스장 A코트 대관", "축구장 예약" 같은 시설 대관성
  콘텐츠가 문화행사/체험 콘텐츠와 섞여 노출될 수 있다 — 사용자가 명시적으로 요청한
  결과이나, 실제 화면에서 자연스러운지는 후속 관찰이 필요하다(Decision 024에도
  명시).
- 개선사항9의 "다른 소스의 이분법 감사"(핵심 요구사항 1의 일반 원칙)는 이번 범위가
  아니다 — SEOUL_YEYAK 체육/공간시설 건에만 한정된 재승인이다.

## 전체 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 133 파일 1531건 통과(이번 스텝 신규 20건 + 기존 8건 갱신).
- `npm run build`: Compiled successfully.
- 프로덕션 DB 직접 적용: `events.price_text`/`source_url` 컬럼 추가, SEOUL_YEYAK
  체육/공간시설 1,525건 재적재+원본 삭제, 최종 카운트 실측 검증 완료.
