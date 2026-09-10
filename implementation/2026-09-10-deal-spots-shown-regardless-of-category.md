# 제휴 상품 연동 스팟을 노출 중분류와 무관하게 스팟픽에 노출 — Step 104

## 구현 대상 (사용자 지시)
"제휴 상품 관련 장소를 입력했는데 스팟픽에서 안 보인다 — 노출 중분류 매핑이
없어서인 듯. 해당 항목들은 노출 중분류와 상관없이 반경 내에 있으면 지도·바텀시트에
노출되게 해줘. 현재 위치 기준 거리순으로. 예: 키즈친화식당 중분류 선택 상태에서
10km 반경 바텀시트에 롯데월드 제휴 상품이 반경 안이면 거리에 맞춰 끼워넣기."

## 구현 일시
2026-09-10

## 변경 사항
### DB — `scripts/migrations/2026-09-10-get-deal-spots-rpc.sql` (적용 완료)
- `get_deal_spots()` RPC 신설 — `get_spots_by_service_category`와 동일한
  RETURNS TABLE 형태로, WHERE만 "노출 활성화 + 운영기간 유효한 `curated_items`가
  연결된(`exists`) 스팟"으로. `location_precision = 'EXACT'` + 대표 1건 조건 유지.
- `gen-types.mjs`로 타입 갱신.

### `src/app/api/nearby/deal-spots/route.ts`
- 응답에 `items: NearbyItem[]`(get_deal_spots RPC 결과 중 실제 활성 제휴 상품이
  매핑된 것) 추가. 기존 `deals`(spot_id → 제목/링크) 그대로.

### `src/components/map/map-explorer.tsx`
- deal-spots fetch에서 `setDealItems(data.items)` 추가.
- `provinceScopedDealItems` useMemo — 지도 마커용은 도(道) 스코프 필터 적용
  (카테고리 항목과 동일 규약, 크로스-도 마커 방지).
- `baseItems`(지도 마커/데스크톱 목록): **노출 중분류를 골랐을 때만**
  `mergeById(provinceScopedCategoryItems, provinceScopedDealItems)`. 기본(반경)
  모드는 이미 반경 내 전체 스팟을 보여줘 병합 불필요, 검색 모드는 "콕 짚어 찾기"라 제외.
- `sheetSourceItems`(바텀시트): 노출 중분류 모드에서 `mergeById(categoryItems,
  dealItems)`(광역 필터 없음 — `mobileSheetItems`의 선택 반경 필터가 "롯데월드가
  10km 안이면 거리순으로 끼워넣기"를 처리).
- `isEmptyByFilter` 노출 중분류 분기: `provinceScopedCategoryItems.length === 0`
  → `visibleItems.length === 0`(병합된 제휴 스팟도 있으면 "비었음" 아님).
- `mergeById` 헬퍼(id 중복 제거 — 제휴 스팟이 우연히 카테고리 결과에도 있으면 한 번만).

### 테스트
- `map-explorer.test.tsx` +1: 어린이 도서관 중분류 선택 상태에서 deal-spots가
  `items`로 내려준 "롯데월드"(중분류 결과엔 없음)가 지도 마커에 병합 노출.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 128 파일 1465건 통과.
- `npm run build`: Compiled successfully.

## 특이 사항
- `get_nearby_spaces_and_events`(기본 반경 모드)는 이미 `curated_items` 무관하게
  반경 내 전체 스팟을 반환하므로, 제휴 스팟이 반경 안이면 기본 모드에서는 원래
  보인다. 문제는 노출 중분류 필터가 그것을 제외하던 것 → 그 경우에만 병합.
- 검색 모드에는 제휴 스팟을 병합하지 않는다("이름으로 콕 짚어 찾기"에 롯데월드가
  끼면 오히려 방해).
