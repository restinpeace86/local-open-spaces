# [이벤트픽 — open_spaces 공유 노출(캠핑장 등) 되돌림]

## 구현 대상
사용자 지시(2026-09-19): "이전에 내가 open_spaces 에있는것중에 휴양마을이나 캠핑장
등 이거 events쪽에도 보여주도록.. 중분류들.. 그렇게 한거 몇개 있는데.. 그렇게 하는거
다시 안보이도록 하자 open_spaces에서 여기 보이려면 예약시스템이든 무언가가 이벤트
관련이 있을때만 이벤트-스팟 연결이 되고 이게 이벤트픽에 보여지는 형태로"

## 구현 일시
2026-09-19

## 배경
`implementation/todo.md` [개선사항 4](2026-09-03)가 캠핑장/체험휴양마을/교육농장/
체험학습장(2026-09-05에 키즈카페 추가)은 "이벤트 자체가 거의 없다"는 이유로
`src/lib/home/get-home-feed.ts`의 `SHARED_OPEN_SPACES_CATEGORY_MINS`를 통해
open_spaces 원본 행을 `item_type: 'EVENT'`로 바꿔치기해 이벤트픽 화면에 함께
노출시켰었다. 원래는 `project/decision-log.md` Decision 013(2026-08-25)이 "상시
야외/자연 스팟은 이벤트픽 피드에서 완벽히 배제"를 명시했었는데, 위 개선사항4가 그
원칙에 예외를 만든 것이었다. 사용자가 이번에 그 예외를 되돌려 원래 원칙으로 복귀할
것을 지시했다.

## 코드 변경
`src/lib/home/get-home-feed.ts`:
- `SHARED_OPEN_SPACES_CATEGORY_MINS` 상수 삭제.
- `getCategoryMinFeed()`: `open_spaces`를 함께 조회해 `item_type='EVENT'`로
  바꿔치기하던 `buildSpaceQuery`/`isSharedCategory`/`spaceItems` 로직을 전부 제거하고
  `events` 테이블만 조회하도록 되돌렸다.
- `getCategoryMinCounts()`: 이 5개 중분류에 한해 `open_spaces` 카운트를 `events`
  카운트에 더해주던 예외를 제거했다 — 이제 모든 중분류가 동일하게 진짜 `events`
  카운트만 반환한다.

`src/lib/spaces/category-maj-meta.ts`: `CATEGORY_MAJ_OPTIONS`의 데이터(중분류 목록)는
스팟픽(open_spaces 탐색) 화면에서 여전히 쓰이므로 그대로 두되, 이제 사라진
`SHARED_OPEN_SPACES_CATEGORY_MINS`를 근거로 들던 주석만 "되돌림" 맥락으로 갱신했다.

## 진짜 이벤트-스팟 연결(변경 없음, 이미 존재)
사용자가 요청한 "예약시스템이든 무언가가 이벤트 관련이 있을때만 이벤트-스팟 연결"은
이미 존재하는 메커니즘이다 — `events.space_id`(FK → `open_spaces.id`)를
`match_events_to_open_spaces()` RPC(일일 배치, 좌표 30m 이내 + 이름 부분일치)와 관리자
수동 연결(`/api/admin/data-grid/space-link`)이 채운다. 진짜 이벤트는 이 되돌림과
무관하게 원래부터 `events` 테이블 자체의 행으로 이벤트픽에 정상 노출되므로, 이번
변경은 "가짜로 스팟을 이벤트처럼 보여주던 경로"만 없앨 뿐 진짜 연결에는 영향이 없다.

## 건드리지 않은 것(범위 확인)
- `src/lib/ai-chat/search-engine.ts`의 `VIBE_CATEGORY_MINS`/`VIBE_EVENT_CATEGORY_MINS`:
  AI 챗봇 검색은 open_spaces를 `item_type='SPACE'`로 정직하게 반환하고(이벤트로
  바꿔치기하지 않음), 이벤트 우선 검색 후 없으면 open_spaces로 폴백하는 별개의
  정상적인 검색 로직이라 이번 되돌림과 무관하다.
- `src/lib/spaces/spot-category-groups.ts`: 스팟픽 어드민 카테고리 그룹핑 taxonomy로,
  이벤트픽 노출과 무관한 별도 화면이라 손대지 않았다.
- `src/components/map/detail-modal.tsx`의 CTA 로직(isEvent일 때 info_url을 null
  취급하지 않는 조건): 필드 값 기반으로만 동작해 진짜 이벤트(`toEventItem`이 info_url을
  항상 null로 채움)에는 영향이 없다 — 삭제할 필요가 없었다.

## 검증
- `src/lib/home/get-home-feed.test.ts`: 신규 테스트 3개 추가 — "과거 open_spaces 공유
  대상이던 중분류도 진짜 이벤트가 없으면 빈 배열", "getCategoryMinCounts가 open_spaces
  건수를 더 이상 합산하지 않음(0 반환)", "진짜 이벤트 카운트는 그대로 반영"(전체 71개
  통과, 기존 테스트는 이 두 함수의 open_spaces 분기를 애초에 검증하지 않고 있었어
  회귀 없음).
- `npx tsc --noEmit`/`npm run test`(166개 파일, 1960개 테스트)/`npm run build` 모두 통과.
- 로컬 개발 서버로 실제 API 응답 확인: `/api/home/category-feed?category=캠핑장` →
  10건 모두 진짜 `events` 행(예: "한강공원 난지캠핑장" 예약 이벤트, item_type='EVENT'),
  `/api/home/category-feed?category=체험휴양마을` → `{items: [], hasMore: false}`(실제
  이벤트가 없어 정상적으로 빈 결과, 에러 없음). `/api/home/category-min-counts` →
  캠핑장 26(진짜 이벤트 건수), 체험휴양마을/교육농장/체험학습장/키즈카페/도시농업 모두
  0(전에는 open_spaces 수천 건이 더해져 있었음).

## 특이 사항
없음 — Decision 013의 원래 원칙으로 정확히 복귀했고, 진짜 이벤트-스팟 연결
메커니즘(`events.space_id`)은 이미 존재해 추가 개발이 필요 없었다.
