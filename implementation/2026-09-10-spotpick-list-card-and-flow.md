# 스팟픽 리스트 카드 재설계(상호명/거리/주소/뱃지) + 진입 경로 정리 — 개선사항2-3 / Step 100

## 구현 대상
사용자 시나리오 워크스루:
- 스팟픽 진입 → 노출 중분류 선택 시 지도에는 현재 위치의 도 단위 마커, 바텀시트는
  내 주변 10km(기본) 반경으로 노출 중분류 스팟이 거리 가까운 순.
- **리스트 항목 = 상호명 / 내 위치로부터의 거리 / 스팟 주소 / 뱃지들** (개선사항2-3).
- 리스트에서 스팟 선택 → 상세 페이지(개선사항3 구조).
- **마커를 눌렀을 때도 같은 상세 페이지로 진입**되어야 함.

## 구현 일시
2026-09-10

## 변경 사항
### `src/components/map/item-list-panel.tsx` (재설계)
스팟픽 데스크톱 좌측 목록 + 모바일 바텀시트 리스트 공용 카드를 스펙대로 교체:
- 1줄: **상호명(좌, bold) + 🧭 거리(우)**. 이벤트는 D-day도 우측.
- 2줄: **상세 주소**(없으면 줄 자체 생략).
- 3줄(2영역): **맞춤형 뱃지 칩** — `badgesBySpotId[id]`가 있으면 "만 N세 이상"
  (amber, `min_age_recommended > 0`) + `badge_labels` 칩. 뱃지가 하나도 없으면
  영역을 렌더링하지 않음.
- **구형 레거시 카테고리 라벨(`meta.label` — '키즈·액티비티' 등) 제거**
  (개선사항2-2·3-2와 동일 취지). 카테고리 색상 도트도 제거(스펙에 없음).

### `src/app/api/nearby/spot-badges/route.ts` (신규)
`GET ?ids=a,b,c`(최대 200) → `{ badges: { [spotId]: { labels: string[], minAge } } }`.
상세 카드용 `/api/spot-curations`와 동일한 라벨 변환(`resolveCurationCategoryId`
+ `getBadgeOptionsForCategory`)을 배치로 수행. 실패해도 200 + 빈 맵(목록은
상호명/거리/주소로 정상 노출 — 제5장 제11조).

### `src/components/map/map-explorer.tsx`
- `listBadgeIdsKey` useMemo(바텀시트 + 데스크톱 목록에 실제로 보이는 id 합집합,
  정렬 후 join) → 이 키가 바뀔 때만 `/api/nearby/spot-badges` 배치 조회 →
  `badgesBySpotId` state.
- `badgesBySpotId`를 `ItemListPanel` 2곳 + `SpotCategoryFilter` 2곳에 전달.

### `src/components/map/spot-category-filter.tsx`
- `badgesBySpotId` prop 추가 → 내부 `ItemListPanel`에 전달(바텀시트 안쪽 결과
  리스트도 동일 카드).

### 테스트
- `src/components/map/item-list-panel.test.tsx` (신규) +5: 상호명/거리/주소 노출 +
  구형 라벨 미노출 / 뱃지 칩(만 N세 이상 + 라벨) / 뱃지 없으면 영역 숨김 /
  클릭 → onSelect(상세 진입) / 주소 없으면 줄 생략.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 128 파일 1463건 통과.
- `npm run build`: Compiled successfully. `/api/nearby/spot-badges` 등록 확인.

## 진입 경로 확인 (기존 동작 — 이번 변경 없음, 정상 동작 확인)
- **리스트 → 상세**: `ItemListPanel.onSelect` → `map-explorer.handleSelectItem` →
  `selectedItem` → `DetailModal spotPickCard`(개선사항3 구조). 정상.
- **마커 → 상세**: 마커 클릭 → `handleMarkerSelectItem` → `MarkerPreviewCard`
  (개선사항2-6에서 상세 카드와 동일 구조 — 좌측 이미지/상호명/거리/주소/맞춤형
  뱃지/🔥 특가로 통일) → 카드 탭 → `handleOpenDetailFromPreview` → `selectedItem`
  → **같은 `DetailModal spotPickCard`**. 즉 마커도 같은 상세 페이지로 진입한다
  (프리뷰 카드는 2026-09-01 "표준 지도 앱 2단계 UX" 결정으로 유지 중인 중간
  단계이며, 개선사항2-6의 "마커 클릭 시 상세 카드로 자연스럽게 연결"을 충족).

## 특이 사항 / 관찰
- 노출 중분류 미선택 상태로 진입하면 "아무것도 안 나오는" 것은 아니고, 설정 위치
  기준 5km 반경의 기본 목록(`get_nearby_spaces_and_events`)이 노출된다. "진입 시
  특정 노출 중분류를 자동 선택"하는 것은 별도 제품 결정이 필요해 이번 범위에서
  다루지 않았다(Spec/Decision에 근거 없음 — 제3장 제5조).
- 바텀시트 목록 상단 건수/노출 중분류별 카운트(`/api/nearby/service-categories`)의
  광역 스코프화는 여전히 별도 후속(Decision 023 영향란).
