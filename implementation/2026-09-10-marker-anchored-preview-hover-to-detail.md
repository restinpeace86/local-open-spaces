# 마커 앵커 프리뷰 카드 + PC 호버 → 상세 진입 — Step 101

## 구현 대상 (사용자 지시)
- "마커 클릭 시 프리뷰 카드가 화면 중앙/하단 고정으로 떠서 마커와 따로 노는
  것처럼 보인다." → **프리뷰 카드를 마커에 붙여서 지도와 함께 이동**하게.
- "PC에서는 마우스 클릭이 아니라 마커에 **호버**하면 프리뷰가 뜨고, **클릭 시
  상세 카드**가 뜨도록."
- (앞선 대화) "마커 누르면 바로 상세 카드로 가야 하는 거 아니냐" → 중간 프리뷰
  2단계 폐지, 마커 → 상세.

기존 2026-09-01 todo.md 지시("표준 지도 앱 방식 2단계 UX — 화면 고정 프리뷰
카드")를 이번 사용자 지시로 개정. (해당 지시는 Decision Log에 정식 기록된 결정이
아니라 todo.md 항목이라 Decision 스킵 대상 아님 — 같은 문서 흐름의 최신 지시로
대체.)

## 구현 일시
2026-09-10

## 변경 사항
### `src/components/map/kakao-map-view.tsx`
- 프리뷰 카드를 **마커 좌표에 앵커한 `kakao.maps.CustomOverlay`** 안에
  `createPortal`로 렌더링 — 지도 이동/확대 시 마커와 함께 이동한다.
- 마커 이벤트:
  - `mouseover`(PC만): 프리뷰 표시. `mouseout`: 220ms 뒤 숨김(마커→카드로
    마우스를 옮기는 사이 유지되도록 지연, 카드 `onMouseEnter`가 타이머 취소).
  - `click`: PC(`(hover:hover) and (pointer:fine)`)면 바로 상세(`onSelectItem`).
    모바일이면 첫 탭 프리뷰, 같은 마커 재탭 상세.
  - 좌표 겹친 그룹(`groupsByPosition` > 1): 기존대로 `onSelectGroup` 우선,
    호버 프리뷰 대상 아님.
- `originLat`/`originLng` prop 추가 — 노출 중분류 전역 조회 결과의
  `distance_meters` -1을 기준점 기준 실제 거리로 보정해 프리뷰/상세에 넘긴다.
- `dealBySpotId` prop 추가 — 프리뷰 카드의 "🔥" 표시용.

### `src/components/map/marker-preview-card.tsx`
- 화면 고정 위치 래퍼(`absolute left-3 right-3 bottom-[184px] ...`) 제거 —
  이제 마커에 앵커된 오버레이 안에서 렌더링되는 말풍선 카드(아래쪽 꼬리 포함,
  `w-64`, 마커 중앙 기준 `-translate-x-1/2`).
- `onMouseEnter`/`onMouseLeave` prop 추가(PC 호버 유지).

### `src/components/map/map-explorer.tsx`
- `previewItem` state / `MarkerPreviewCard` 렌더 / `handleOpenDetailFromPreview` /
  `handleClosePreview` 제거 — 프리뷰는 이제 KakaoMapView 내부 책임.
- `handleMarkerSelectItem` = 상세 카드 진입 + 바텀시트 접기.
- `KakaoMapView`에 `dealBySpotId`/`originLat`/`originLng` 전달.

### `spec/map/spatial-search.md` §2.2
- 스팟픽 마커 인터랙션 규칙 개정 명시(마커 앵커 프리뷰, PC 호버→프리뷰·클릭→상세,
  모바일 첫 탭 프리뷰·재탭 상세).

### 테스트
- `map-explorer.test.tsx`: "마커 클릭 2단계 UX" describe → "마커 클릭 → 상세
  카드"로 재작성(프리뷰 재탭/닫기 테스트 제거 — 호버·앵커 프리뷰는 KakaoMapView
  내부라 별도 단위 테스트 대상 아님, 기존 관례). "그룹 펼쳐보기" 테스트에서
  중간 프리뷰 탭 클릭 제거(마커 클릭만으로 상세 진입).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 128 파일 1461건 통과(직전 1463 → 프리뷰 전용 테스트 2건 제거).
- `npm run build`: Compiled successfully.

## 특이 사항
- KakaoMapView는 이 프로젝트에서 단위 테스트 대상이 아니라(실제 Kakao SDK 필요,
  모든 사용처에서 mock) 호버·앵커 프리뷰의 실제 렌더링은 실기기 확인 대상이다.
- `window.matchMedia` 미지원 환경(jsdom 등)에서는 `canHover=false`로 폴백해
  모바일 동작(탭 → 프리뷰 → 재탭 → 상세).
