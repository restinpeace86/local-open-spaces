# [마이리얼트립 공식 파트너 API 연동 — 관리자 탐색/등록 탭]

## 구현 대상
사용자 지시(2026-09-16): [개선사항 1](마이리얼트립 등 제휴 상품 URL 크롤링, robots.txt
정책 충돌로 스킵)에 대해 "개선사항1은 포기, 대신 MYREALTRIP_API_KEY 발급받음.
공식적인 API를 통하여 데이터 가져오는 방법 확인해보자" — 이후 대화로 5개
엔드포인트(categories/search/detail/options/calendars)를 실측 확인했고, "일단
키즈 카테고리뿐만 아니라 가족끼리 갈만한 곳들도 확인해봐야 하는데.. 데이터
나오는 걸 보고 축소하든 결정하든 해야 할 것 같아 — 일단 관리자용에 구현해보자.
탭 하나 파거나 아니면 현재 있는 큐레이션/제휴 마케팅 쪽에 구현하거나"로 이번
구현 범위가 확정됨.

## 구현 일시
2026-09-16

## [개선사항 1]과의 관계
스킵 당시 재개 선행 작업으로 "② 대상 사이트가 공식 제휴/어필리에이트 API·
데이터 피드를 제공하는지 확인해(제공한다면 공식 채널이 스크래핑보다 안전)"를
제시했었다 — 정확히 그 경로로 재개됐다. robots.txt 크롤링 금지와 무관하게
승인된 파트너 API를 호출하는 것이라 정책 충돌이 없다.

## 실측으로 확인한 API 구조(사용자와 함께 검증)
- `POST /v1/products/tna/categories` — 도시별 카테고리 목록. **카테고리 값은
  도시마다 다름**(서울/부산/제주 실측 비교로 확인, 하드코딩 금지). 서울/부산/제주
  전부 "키즈"(value: `kids`) 카테고리가 실제로 존재함을 확인.
- `POST /v1/products/tna/search` — 키워드(필수)+카테고리+가격+정렬로 검색.
  `category: "kids"` 필터로 실제 아동 대상 상품(국립중앙박물관 도슨트 투어,
  궁궐투어, 뮤지컬 등)만 정확히 걸러짐을 확인.
- `POST /v1/products/tna/detail`(gid) — 상세 설명(HTML)/포함·불포함사항, 단
  title은 항상 빈 문자열(스키마 특성, 여러 상품으로 확인).
- `POST /v1/products/tna/options`(gid, date) — 특정 날짜의 실제 예약 가능
  옵션/가격. 상품에 따라 특정 요일에만 열리는 경우가 있음을 실측 확인.
- `POST /v1/products/tna/calendars`(gid, date) — 월 단위 예약 불가일(blockDates)
  한 번에 조회, options보다 효율적.

**이번 구현 범위는 categories+search만이다** — detail/options/calendars는
카테고리 범위(키즈만 vs 가족 전반) 결정 이후 실제 노출/등록 기능에 필요할 때
붙이면 된다(제3장 제3조 MVP 우선, 지금은 순수 탐색 단계).

## 변경 사항
### 백엔드 (API 키를 서버에만 보관)
- `POST /api/admin/myrealtrip/categories`: `{city}` → 도시별 카테고리 프록시.
- `POST /api/admin/myrealtrip/search`: `{keyword, category?, minPrice?, maxPrice?,
  sort?, page?, size?}` → 상품 검색 프록시(1-based 페이지네이션, 문서 경고대로
  숙소/항공 검색과 다름을 주석에 명시).
- `src/lib/admin/myrealtrip-search.ts`: 타입 정의 + `mapSearchItemToCuratedItemPrefill()`
  (검색 결과 → 기존 curated_items 등록 폼에 채울 값 매핑, 순수 함수라 단위
  테스트 용이).

### 관리자 UI
- 신규 탭 `myrealtrip_search`("🔍 마이리얼트립 상품 검색") 추가 —
  `AdminTable`/`TAB_LABEL`/`FilterOptions`에 자기완결 패널 관례(curated_items 등과
  동일)로 등록.
- `MyRealTripSearchPanel`: 도시/카테고리/키워드/가격/정렬로 검색, 결과를 카드
  그리드(썸네일/제목/가격/카테고리/리뷰)로 표시. 기존 "🏷️ 큐레이션/제휴 상품"
  탭과 별도 탭으로 분리한 이유는 목적이 다르기 때문(탐색 vs 이미 등록한 상품
  관리) — 제5장 제4조의 "동일 목적 중복 방지"이지 "다른 목적을 억지로 통합"은
  아니라고 판단.
- 각 결과 카드의 "＋ 큐레이션에 등록" 버튼 → 기존 `CuratedItemFormModal`을
  그대로 재사용해 신규 등록 폼을 연다. 이를 위해 그 모달에 `prefill` prop을
  추가했다 — 기존 `initial`(수정 모드, id 있는 기존 행)과 의미가 다르므로 별도
  prop으로 분리: `prefill`은 신규 등록(POST)인데 값만 미리 채우는 것이라 `isEdit`
  판정에 영향을 주면 안 된다(원래 `initial`을 재사용했다면 PATCH를 시도해
  존재하지 않는 id로 실패했을 것 — 실제로 테스트로 이 구분을 검증함).

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1823개, 신규 14개 포함), `npm run build`
  모두 통과(`/api/admin/myrealtrip/categories`, `/api/admin/myrealtrip/search`
  라우트 정상 등록 확인).
- 실제 API로 재현 호출: `categories({city:"서울"})` → 실제 카테고리 24개 반환,
  `search({keyword:"서울", category:"kids"})` → "[키즈][인천/강화] 톰아저씨
  트리하우스 숲체험&공방체험" 등 실제 아동 대상 상품이 정확히 반환됨을 확인.

## 이번 범위에서 의도적으로 손대지 않은 것
- detail/options/calendars 프록시 라우트(카테고리 범위 결정 후 필요 시 추가).
- "키즈" 외 카테고리(체험·클래스, 액티비티 등)에 섞여 있는 가족 대상 상품을
  자동으로 골라내는 로직 — 이건 데이터를 보고 판단할 사람의 몫이라 임의로
  키워드 필터를 지어내지 않았다(제3장 제5조 추측 금지). 현재 UI는 카테고리를
  자유롭게 바꿔가며 비교해 볼 수 있게만 해 둔 상태다.
- curated_items 스키마에 가격/리뷰 등 신규 컬럼 추가 — 요구되지 않은 확장이라
  하지 않았다(제5장 제7조).
