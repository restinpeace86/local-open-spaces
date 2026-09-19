# [이벤트픽 카드 — 동일 스팟(space_id) 예약 옵션 그룹핑]

## 구현 대상
사용자 지시(2026-09-19): "한강공원 난지캠핑장에 대하여 장소스팟으로 그룹핑하긴
했는데 그 예약 이벤트 한건으로 해서 보게 못해? 묶음으로 해서 이벤트 보여주던가?"
— 직전 작업([개선사항 4 되돌림])으로 진짜 `events.space_id` 연결만 이벤트픽에
남긴 결과, 난지캠핑장 하나에 진짜 연결된 활성 이벤트가 13건(프리캠핑존/
일반캠핑존 A~D형/캠프파이어존/바비큐존 × 월별)이라 피드가 한 스팟으로 도배되는
문제가 드러났다. 후속 대화에서 "대표 1건+예약 옵션 N개 뱃지, 탭하면 개별 옵션
목록, 예약/상세 접근은 지금처럼 개별 유지, 단 동일 스팟이지만 다른 이벤트는
합치면 안 됨"으로 요구사항을 구체화했다.

## 구현 일시
2026-09-19

## 조사 — 왜 "space_id만으로" 전체 일반화하면 안 되는가
실측(라이브 DB)으로 space_id당 활성 이벤트 5건 이상인 스팟 29곳을 전수 확인했다:
- "같은 프로그램의 옵션 차이"인 진짜 안전한 케이스는 GO_CAMPING 소스 캠핑장
  2곳뿐(난지캠핑장 13건/서천 금빛노을 서울캠핑장 5건, 전부 `category_min='캠핑장'`).
- 나머지 22곳(대부분 CULTURE_FACILITY — 박물관/아트센터/도서관 등)은 실제 제목을
  확인해보니 서로 다른 전시/강좌/프로그램이었다 — 이런 곳을 space_id만으로
  묶으면 사용자가 명시적으로 금지한 "다른 이벤트를 합치는" 오류가 그대로
  발생한다(라이브 검증: '역사' 카테고리에서 "[한양도성박물관] 한양도성 탐험대"와
  "[한양도성박물관] 흥인지문의 비밀"이 같은 스팟이지만 서로 다른 프로그램으로
  개별 노출돼야 함을 실측으로 재확인).
- "서천 금빛노을 서울캠핑장" 자체도 함정이 있었다: 연결된 5건 중 실제로는
  "포천 서울캠핑장"/"서천 서울오토캠핑장"/"서천 서울캠핑장" 3개의 서로 다른
  물리적 장소가 섞여 있었다(상위 매칭 배치의 기존 부정확성, 별도 이슈).
- 원천 데이터(SEOUL_YEYAK)에는 "같은 프로그램의 옵션"과 "다른 프로그램"을 구분할
  구조적 필드가 아예 없다(SVCID는 옵션 단위 유일, MINCLASSNM은 너무 뭉뚱그려짐) —
  텍스트로 구분하는 것은 추측 금지 원칙(제3장 제5조)에 어긋난다.

**결론**: 실측으로 안전함이 확인된 `category_min='캠핑장'`에만 좁혀 적용하고,
그룹핑 키도 `space_id` 단독이 아니라 `(space_id, address)`(이벤트의 address는
`toEventItem`이 이미 venue_name을 그대로 담아둔 값)로 잡아 상위 매칭 오류로 다른
물리적 장소가 섞이는 것까지 추가로 막는다.

## 코드 변경

### 타입 — `src/lib/spaces/get-nearby.ts`
`NearbyItem`에 `space_id?: string | null`, `grouped_count?: number` 추가(기존
`group_id?`—스팟 중복 통합용, 완전히 다른 개념—와 동일하게 optional). 이 타입을
만드는 다른 모든 생성 지점(RPC 매핑, ai-chat 등)은 그대로 undefined로 남아 영향
없음.

### 백엔드 — `src/lib/home/get-home-feed.ts`
- `EVENT_COLUMNS`/`EventRow`/`toEventItem`에 `space_id` 추가.
- `SPACE_ID_GROUP_CATEGORY_MINS = new Set(['캠핑장'])` — 실측으로 검증된
  category_min만 담은 허용 목록(기존 `EXCLUDED_CATEGORY_MIN_FILTER`와 동일한
  관례). 다른 카테고리도 검증되면 여기에 추가할 수 있다.
- `groupBySpaceId()` 신규 — `(space_id, address)` 키로 묶어 대표 1건(가장 이른
  start_date)을 고르고 `grouped_count`(2 이상일 때만)를 채운다.
- `getCategoryMinFeed()`가 `dedupeAndMergeFree()` 결과에 대해
  `SPACE_ID_GROUP_CATEGORY_MINS.has(categoryMin)`일 때만 `groupBySpaceId()`를
  추가로 적용한다. `getCategoryMinCounts()`는 건드리지 않았다 — 이 카운트는
  바텀시트 "0건 칩 숨김" 판단에만 쓰이고 숫자 자체를 사용자에게 보여주지
  않는다(`major-category-grid.tsx` 확인).

### 카드 뱃지 — `event-card.tsx`, `event-list-row.tsx`
`grouped_count`가 2 이상이면 "예약 옵션 N개" 뱃지를 카테고리 뱃지 옆(카드)/배지
로우(리스트 행)에 추가로 노출한다.

### 상세 모달 — `src/components/map/detail-modal.tsx`
기존 "스팟 → 연결된 이벤트"(`linkedEvents`, `/api/spots/linked-events?spot_id=
{spot.id}`) 패턴의 반대 방향으로 동일한 API 라우트를 그대로 재사용한다(백엔드
변경 없음 — "space_id로 연결된 활성 이벤트를 돌려준다"는 라우트 의미가 호출
방향과 무관하게 동일). `isEvent && item.space_id`일 때 `/api/spots/linked-events
?spot_id={item.space_id}`를 조회해 `ev.id !== item.id && ev.address ===
item.address`인 것만 "📋 이 장소의 다른 예약 옵션" 섹션에 목록으로 보여주고,
클릭하면 기존 `setLinkedDetailItem`으로 중첩 `DetailModal`을 열어 그 옵션
자신의 완전히 독립된 CTA/예약 링크로 진입한다(그룹핑은 표시 전용, 데이터/예약
흐름은 전혀 건드리지 않음 — 요청사항 그대로). 이 섹션은 EVENT 전용 레이아웃
(8단 구조) 안, 기존 `linkedSpot`("📍 연결된 장소") 바로 아래에 둔다.

## 검증
- `npx tsc --noEmit`/`npm run test`(166개 파일, 1970개 테스트 — 그룹핑 로직 3개,
  카드/리스트 뱃지 4개, 상세 모달 섹션 3개 신규)/`npm run build` 모두 통과.
- 로컬 dev 서버로 실제 API 재확인:
  - `/api/home/category-feed?category=캠핑장` → 난지캠핑장이 13장이 아니라
    `grouped_count: 7`인 대표 1건으로, "포천 서울캠핑장"은 별도 카드로(서천
    스팟의 매칭 오류 사례가 실제로도 안전하게 분리됨) 정상 노출.
  - `/api/home/category-feed?category=역사`(CULTURE_FACILITY 케이스) → 4건
    전부 개별 노출, `grouped_count` 전부 undefined(허용 목록 밖이라 그룹핑
    미적용) — 서로 다른 프로그램이 잘못 합쳐지지 않음을 실측 확인.

## 특이 사항
`category_min='캠핑장'` 1개만 허용 목록에 넣었다 — "서천 금빛노을 서울캠핑장"처럼
같은 카테고리 안에서도 상위 매칭 배치가 서로 다른 물리적 장소를 한 space_id로
잘못 연결해둔 사례가 실측으로 발견됐다(이번 작업 범위 밖, 손대지 않음). 이번
`(space_id, address)` 키는 그 부작용까지 방어하지만, 근본 원인(매칭 배치 정확도)
자체를 고치는 것은 아니다 — 필요하면 별도로 다뤄야 한다.
