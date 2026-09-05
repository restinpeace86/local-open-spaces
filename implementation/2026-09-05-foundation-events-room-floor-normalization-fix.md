# GG_FOUNDATION_EVENT(API2) 지오코딩 — 실/층 단위 정규화 누락 버그 수정

## 구현 대상
사용자가 실제 로그(`전곡선사박물관 고고학체험실`, `백남준아트센터 내외부`)를 제시하며
"고고학체험실 같은건 정규화를 통해서 제거되고 전곡선사박물관만 지오코딩으로 던져야
할텐데? 로직에 구멍이 있는건지 원인확인해줘" 지적. 원인 확인 후 실제 버그로 확정,
수정까지 완료.

## 구현 일시
2026-09-05

## 원인 — 실측으로 확인한 진짜 버그(추측 아님)
`scripts/ingest/adapters/gg-culture-events-adapter.mjs`의 `transformFoundationEvents`
(GGCULFOUEVENSTM/API2 최초 수집)는 원본 `LOC_NM`을 콤마로만 나누고(`.split(',')[0]`),
그 텍스트를 **정규화 없이 그대로** `geocode()`에 던지고 있었다:
```js
const primaryLocation = item.LOC_NM?.split(',')[0]?.trim();
const coords = await this.geocodeOrSkip(title, primaryLocation);
```
"건물명 뒤에 실/층/홀 단위가 붙으면 지오코딩이 실패하니 그 단위를 제거하고 재시도한다"는
정규화 로직(`stripRoomFloorDescriptor`/`normalizeVenueText`, "내외부"도 제거 대상 단어
목록에 포함돼 있음)은 **이미 존재했지만**, `gg-culture-location-enrichment.mjs`(API1 —
`GGCULTUREVENTSTUS`의 CITY_APPROX/UNKNOWN 좌표를 나중에 보완하는 별개의 후처리
스크립트)에만 구현돼 있었다. API2(GGCULFOUEVENSTM)는 원본에 애초에 `LOC_NM`(장소
텍스트)이 있어서 이 보완 스크립트의 대상이 아니고(대상 조건이 `location_precision IN
('CITY_APPROX','UNKNOWN')`인데 API2는 처음부터 EXACT 아니면 행 자체를 안 만듦 — 어댑터
파일 자체 주석에 명시), 결과적으로 API2의 최초 수집 경로는 이 정규화를 **한 번도** 거치지
않는 별개의 코드 경로였다. 사용자가 지적한 "구멍"이 정확히 이것이다 — 정규화 함수가
프로젝트에 존재하는 것과, 그 함수가 실제로 이 경로에서 호출되는 것은 별개였다.

## 변경 사항
- `scripts/ingest/adapters/gg-culture-events-adapter.mjs`: `gg-culture-location-
  enrichment.mjs`의 기존 `normalizeVenueText`(순수 함수, 이미 검증됨)를 재사용해,
  `transformFoundationEvents`가 원문으로 먼저 시도하고(건물명+실 전체가 하나의 POI로
  등록돼 성공하는 경우도 있어 원문 우선순위는 그대로 유지 — enrichment 스크립트와 동일한
  순서) 실패하면 정규화(실/층/홀 단위 제거)한 이름으로 한 번 더 시도하도록 고쳤다.
  - 이 변경으로 두 어댑터/후처리 파일이 서로를 import하는 순환 참조가 생긴다
    (`gg-culture-location-enrichment.mjs`도 원래부터 이 파일의 `GYEONGGI_BOUNDS`/
    `isWithinGyeonggiBounds`를 가져다 쓰고 있었음). 둘 다 모듈 최상단이 아니라 함수
    본문 안에서만 서로의 값을 참조해 실행 시점(양쪽 모듈이 이미 완전히 로드된 뒤)에는
    문제가 없다 — `node -e`로 양방향 로드 순서를 각각 직접 실행해 정상 로드됨을
    확인했고, 전체 테스트 스위트 통과로도 재확인했다(추측이 아니라 실측).

## 검증
- **사용자가 제시한 두 실제 사례를 그대로 재현하는 회귀 테스트 추가**
  (`gg-culture-events-adapter.test.mjs`): "전곡선사박물관 고고학체험실"→1차 실패 시
  "전곡선사박물관"으로 2차 시도, "백남준아트센터 내외부"→1차 실패 시 "백남준아트센터"로
  2차 시도 — 둘 다 `geocode`가 정확히 그 순서/인자로 호출되는지 `toHaveBeenNthCalledWith`로
  검증.
- 순환 참조가 실제로 안전한지 `node -e`로 양방향 동적 import를 직접 실행해 확인(추측 금지).
- `npx tsc --noEmit` 통과, `npm run test`: 108개 파일 / 1132개 테스트(기존 1130개 + 신규
  2개) 전체 통과, `npm run build` 통과.

## 특이 사항
- **정규화는 "원문 실패 시의 폴백"이지 "항상 우선 적용"이 아니다** — 건물명+실 전체가
  하나의 등록된 장소(POI)로 카카오 검색에 걸리는 경우가 실제로 있어(예:
  `gg-culture-location-enrichment.test.mjs`의 기존 케이스들), 원문을 먼저 시도하고
  실패했을 때만 정규화한 이름으로 재시도하는 기존 순서를 그대로 따랐다. 사용자가 로그로
  본 "시도 2/3... 재시도" 메시지는 이 원문 1차 시도가 V-World 연결 자체가 안 되는(직전
  작업에서 고친 서킷 브레이커 대상) 상황과 겹친 것으로, 이번 수정과는 별개의 문제였다 —
  다만 V-World가 정상이더라도 원문이 실패하면(NOT_FOUND) 지금까지는 정규화 재시도 자체가
  없었으므로, 이번 수정은 V-World 정상 가동 시에도 유의미하다.
- **API1(GGCULTUREVENTSTUS)은 영향받지 않는다** — 그쪽은 원본에 애초에 장소 텍스트가
  없어 크롤링 후 후처리(enrichment)로만 좌표를 보완하며, 그 경로는 이미 정규화를 쓰고
  있었다(변경 없음).
