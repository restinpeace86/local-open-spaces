# 주변 주차장/식당 섹션 — 아코디언 폐기, 항상 펼쳐진 평면 구성으로 전환

## 구현 대상
`todo.md` 개선사항 2 중: "현재 주변 주차장정보나 주변 식당정보에 대하여서도
간단하게 아코디언으로 숨기기 했는데 그러지말고 하나의 영역으로써 원페이지
에서 좀 사용자가 글을 내리면서 직관적으로 알수있는 구성으로 가자."

## 구현 일시
2026-10-20

## 변경 사항
`src/components/map/nearby-amenities-section.tsx`:
- `AccordionShell`(토글 버튼 + `isOpen`일 때만 children 렌더 + 펼침 시
  스크롤 포커스 보정)을 `AmenitySection`으로 교체 — 토글 자체를 없애고
  카운트가 0이 아니면 바로 목록까지 렌더링한다.
- `ParkingAccordion`/`RestaurantAccordion` → `NearbyParkingSection`/
  `NearbyRestaurantSection`으로 이름도 함께 바꿈(더 이상 아코디언이
  아니므로). 각자 갖고 있던 `isOpen`/`setIsOpen` 상태 제거.
- `MatchedParkingCard`(부설 주차장 1:1 매칭 카드)도 동일하게 자체
  `isExpanded` 토글을 제거하고 항상 펼쳐진 카드로.
- 이전에 2026-10-02에 "기본 접힘 + 사용자가 펼쳐야 보임"으로 사용자가
  직접 확인했던 결정을 이번 지시로 되돌린 것 — 주석에 변경 이력을
  남겼다.

`src/components/map/detail-modal.tsx`: 주석 제목의 "아코디언" 표기를
"섹션"으로 정정(동작은 그대로 유지하던 두 곳 — EVENT/SPACE 분기).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(334 파일 3,337개) /
  `npm run build` 전부 통과.
- `nearby-amenities-section.test.tsx`를 토글 클릭 기반 테스트에서
  "처음부터 바로 보인다" 기준으로 재작성(4개 통과). 더 이상 존재하지
  않는 "다시 누르면 접힌다" 테스트는 삭제.

## 특이 사항
- 없음 — 순수 UI 동작 변경(항상 펼침)이라 데이터/API 변경은 없다.
