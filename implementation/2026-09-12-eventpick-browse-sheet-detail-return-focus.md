# 이벤트픽 전체보기 바텀시트 — 상세카드 취소 시 목록 복귀 + 포커스 (Step 120)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
> "이벤트픽화면에서 전체보기 눌렀을때 바텀시트로 리스트 목록 열리고 그걸 눌렀을때
> 상세카드 보이는데.. 상세카드 취소시 바로 전단계인 리스트 목록 열리고 방금전에
> 누른 리스트가 포커스 되어야 하는데 .. 그냥 사라져버리고 이벤트픽 화면이 뜬다..
> 다시 전체보기 누르고 처음부터 봐야 하는 상황이라 불편함. 사용자 경험을 해치고
> 있음."

## 원인
`HomeView`의 "오늘 전체보기"/"지금 이 순간 함께하기 좋은 알찬 픽"/"놓치면 후회하는
인기 만점 예약 픽" 3개 `EventBrowseSheet` 흐름에서, 목록 항목을 누르는 즉시
`onSelectItem` 콜백이 `setBrowseSheetMode(null)`로 바텀시트 자체를 언마운트하면서
`setSelectedItem(item)`으로 상세카드(DetailModal)를 열었다. 상세카드를 닫으면
`selectedItem`만 `null`이 될 뿐 `browseSheetMode`는 이미 `null`이라 바텀시트가
돌아오지 않고 이벤트픽 기본 화면이 그대로 노출됐다.

반면 "대분류 그리드"(`MajorCategoryGrid`, 4곳 중 나머지 하나)는 시트가 열려있는지
여부(`isSheetOpen`)를 자기 자신의 로컬 상태로 갖고 있어 이 문제가 원래 없었다 —
결과 항목 선택(`onSelectResultItem`)이 그 상태를 건드리지 않기 때문.

## 변경 사항
- `src/components/home/home-view.tsx`:
  - `EventBrowseSheet`의 `onSelectItem`에서 `setBrowseSheetMode(null)` 호출을
    제거했다 — 시트는 계속 열어둔 채 `DetailModal`만 그 위에 겹쳐 띄운다(JSX상
    `DetailModal`이 `EventBrowseSheet`보다 나중에 렌더링되므로 별도 z-index 조정
    없이 자연스럽게 위에 쌓인다). 시트를 명시적으로 닫을 때(✕/배경 클릭)만
    `browseSheetMode`를 `null`로 되돌린다.
  - 신규 상태 `focusedListItemId`: 목록에서 항목을 선택한 순간의 `item.id`를 저장해
    상세카드를 닫은 뒤 돌아간 목록에서 그 항목을 강조 표시하는 데 쓴다.
    `EventBrowseSheet`/`MajorCategoryGrid` 양쪽에 `focusedItemId` prop으로 전달한다
    (전체보기 4곳 UX 일관성 — 2026-09-11 Step 109에서 이미 통일한 원칙과 동일).
- `src/components/cards/event-list-row.tsx` (양쪽 시트가 공유하는 행 컴포넌트):
  신규 `isFocused?: boolean` prop 추가. `true`면 파란 테두리/링 강조 스타일을 입히고,
  `useRef` + `useEffect`로 `scrollIntoView({ block: 'nearest' })`를 호출해 화면
  밖에 있어도(무한 스크롤로 목록이 길어진 경우) 보이는 위치로 스크롤한다.
  `scrollIntoView`가 없는 환경(jsdom 등)에서도 죽지 않도록 함수 존재 여부를
  방어적으로 확인한다.
- `src/components/home/event-browse-sheet.tsx`, `src/components/home/major-category-grid.tsx`:
  `focusedItemId?: string | null` prop을 받아 각 `EventListRow`에 `isFocused={item.id === focusedItemId}`로 전달.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1560 tests 전체 통과. 신규/보강 테스트:
  - `event-list-row.test.tsx`: `isFocused` true/false에 따른 강조 스타일, scrollIntoView 호출 검증(2건).
  - `event-browse-sheet.test.tsx`: `focusedItemId`를 넘기면 해당 항목만 강조되는지(1건).
  - `home-view.test.tsx`: **핵심 회귀 테스트** — "오늘 전체보기" 시트를 열고 항목을 눌러
    상세카드를 연 뒤, 상세카드의 닫기 버튼만 눌러도 시트 자체가 사라지지 않고
    그대로 남아 있으며 방금 눌렀던 항목도 계속 보이는지 확인(1건). 위치 온보딩
    모달도 동일한 `aria-label="닫기"`를 쓰므로 기존 관례대로 `localStorage`에
    위치를 미리 설정해 온보딩 모달을 배제했다.
- `npm run build`: 성공(라우트 목록 변화 없음).

## 특이 사항
- `MajorCategoryGrid` 경로는 원래도 버그가 없었지만(자체 `isSheetOpen` 로컬 상태),
  "방금 누른 항목 포커스 표시" 기능은 사용자가 명시한 요구사항이라 두 경로 모두에
  일관되게 적용했다.
- 시트를 명시적으로 닫으면(✕/배경 클릭) `focusedListItemId`도 함께 초기화해, 다음에
  새로 여는 시트에 이전 강조가 남지 않게 했다.
