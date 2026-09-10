# 상세 카드 흐름 마무리 — 예약 버튼 정리 + 리스트 포커스 복원 — Step 102

## 구현 대상 (사용자 시나리오 워크스루)
- 상세 카드: 이미지/상호명/거리/주소/뱃지 한눈에, 거리 클릭 → 인앱 길찾기 →
  뒤로가기 → 상세 복귀, 메뉴/가격/영업시간 정돈 텍스트, 블로그 → 뒤로가기 →
  상세 복귀(한 흐름).
- **맨 아래 "예약하기"**: 자사 시스템 예약 가능 여부를 먼저 보고(미구현) 없으면
  네이버 예약으로. 네이버 예약 링크가 있으면 그 버튼, 없으면 버튼 숨김.
- **상세 밖/X 로 닫기** 후: **마커로 들어왔으면** 그 마커부터, **카드 리스트에서
  들어왔으면 리스트에 그 항목이 포커스**되어 있어야 함.

## 구현 일시
2026-09-10

## 변경 사항
### `src/components/map/detail-modal.tsx`
- **스팟픽 카드 하단 = "예약하기" 전용**: `secondaryAction`의 `spotPickCard`
  분기를 `item.reservation_url`("📝 예약하기", 공간엔 컬럼이 없어 사실상 미사용)
  → `curation.naver_booking_url`("🟢 네이버로 예약하기") → 없으면 `null`(버튼
  숨김)로 정리. 공식 홈페이지(`info_url`)는 "예약"이 아니므로 하단 버튼에서 빼고,
  상세 정보(`<dl>`)에 **"홈페이지 → 공식 홈페이지 바로가기 ↗"** 행으로 노출.
- (다른 화면은 기존 폴백 체인 그대로.)
- 거리 클릭 → `MapPreviewModal`(인앱 길찾기, `useModalBackClose`로 뒤로가기 1회
  = 이 모달만 닫고 상세 유지) / 블로그 버튼 `target="_blank"`(앱 미이탈 → 뒤로
  = 상세 그대로) — 기존 구현 확인, 변경 없음.

### `src/components/map/map-explorer.tsx`
- `lastListSelectedId` state — `handleSelectItem`(리스트/필터에서 고름)에서
  세팅, `handleMarkerSelectItem`에서 `null`로(마커 진입은 리스트 포커스 안 남김).
  노출 중분류 전환/검색 시작·종료 시 초기화.
- `ItemListPanel`/`SpotCategoryFilter`에 `selectedId = selectedItem?.id ??
  lastListSelectedId` 전달 → 상세를 닫아도 그 항목 하이라이트 유지.

### `src/components/map/item-list-panel.tsx`
- 선택 항목: `bg-blue-50` + `ring-1 ring-blue-300` + `aria-current="true"`.
- 선택 항목이 목록에 있으면 `scrollIntoView({ block: 'nearest' })`(jsdom 방어 —
  `typeof ... === 'function'` 가드).

### `src/components/map/spot-category-filter.tsx`
- `selectedListId` prop 추가 → 내부 `ItemListPanel`에 전달.

### 테스트
- `detail-modal.test.tsx` +1: spotPickCard + info_url → 하단 예약 버튼 없이
  "공식 홈페이지 바로가기 ↗" 행 링크만.
- `map-explorer.test.tsx` +2: 리스트 → 상세 → 닫기 후 그 항목 `aria-current` 유지 /
  마커 → 상세 → 닫기 후 리스트 포커스 안 남음.
- `item-list-panel.tsx`의 `scrollIntoView` jsdom 미구현으로 인한 전체 map-explorer
  테스트 크래시를 `typeof` 가드로 수정.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 128 파일 1464건 통과.
- `npm run build`: Compiled successfully.

## 시나리오 대조 (현재 동작 확인)
| 항목 | 상태 |
|---|---|
| 이미지/상호명/거리/주소/뱃지 한눈에 | ✅ (Step 95, spotPickCard) |
| 거리 클릭 → 인앱 길찾기 → 뒤로 → 상세 | ✅ MapPreviewModal + useModalBackClose |
| 메뉴/가격/영업시간 정돈 텍스트 | ✅ `<dl>` |
| 블로그 → 뒤로 → 상세(한 흐름) | ✅ target=_blank (앱 미이탈) |
| 맨 아래 = 네이버 예약 있으면 버튼, 없으면 숨김 | ✅ (이번) |
| 공식 홈페이지 = 정보 행 링크 | ✅ (이번) |
| 밖/X 로 닫기 | ✅ |
| 마커 진입 → 닫기: 마커부터 | ✅ (리스트 포커스 안 남김) |
| 리스트 진입 → 닫기: 리스트에 포커스 | ✅ (이번) |
