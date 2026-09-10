# 관리자 제휴 상품 ↔ 스팟(Spot) 연동 + 스팟픽 특가 마커 — 개선사항6 / Step 98

## 구현 대상
`implementation/todo.md` 개선사항6:
1. 관리자 [큐레이션/제휴상품] 탭 신규 상품 등록 폼에 '장소(Spot)' 선택/검색 필드
   추가 — 통합 장소 검색 + 외부 API Fallback/Auto-Upsert 파이프라인 적용, `spot_id`
   1:1 매핑 저장.
2. 스팟픽 지도 마커 연동 — `spot_id` 매핑 + '노출 활성화'된 제휴 상품이 있는
   스팟은 특별 마커(특가/Hot)로 강조, 마커/상세 카드 진입 시 연동 제휴 상품/링크로
   연결.

## 구현 일시
2026-09-10

## 변경 사항
### DB — `scripts/migrations/2026-09-10-curated-items-spot-link.sql` (적용 완료)
- `curated_items.spot_id uuid references open_spaces(id) on delete set null` + 부분 인덱스.
- UNIQUE 제약은 걸지 않음(한 스팟에 시즌별로 여러 상품이 붙었다 떨어지는 운영 허용,
  노출은 is_active로 제어).
- `gen-types.mjs`로 타입 갱신.

### 관리자
- `src/app/api/admin/curated-items/route.ts`: GET `select('*, spot:open_spaces(id,name,address)')`,
  POST/PATCH가 `spot_id`(uuid 형식 검증, 빈 값이면 null=연동 해제) 저장.
- `src/components/admin/curated-item-form-modal.tsx`: `CuratedItemFormValue`에
  `spot_id`/`spot` 추가, "연동 장소(Spot) — 선택" 필드에 **글쓰기 `SpotPicker`
  그대로 재사용**(내부 `/api/spots/search` → 카카오 로컬 `/api/spots/search-external`
  Fallback → `/api/spots/upsert-external` Auto-Upsert). 제출 payload에 `spot_id`.

### 소비자(스팟픽)
- `src/app/api/nearby/deal-spots/route.ts` (신규): `is_active=true` + `spot_id`
  not null + 운영기간(operation_start/end_date)이 오늘 포함/상시인 제휴 상품 →
  `{ deals: { [spotId]: { title, bookingUrl, imageUrl } } }`. 실패해도 200 + 빈 맵.
- `src/lib/kakao/marker-image.ts`: `buildDealMarkerSvgDataUrl()` 신규 — 금색 핀 +
  🔥, 34x44(일반 28x36보다 큼).
- `src/components/map/kakao-map-view.tsx`: `dealSpotIds?: Set<string>` prop —
  해당 스팟은 특가 마커 + `setZIndex(5)`로 위로.
- `src/components/map/map-explorer.tsx`: 마운트 시 `/api/nearby/deal-spots` 1회
  조회 → `dealBySpotId` 상태 + `dealSpotIds` useMemo → `KakaoMapView`,
  `MarkerPreviewCard`(deal), `DetailModal`(deal, spotPickCard)에 전달.
- `src/components/map/marker-preview-card.tsx`: deal이면 상호명 앞에 🔥.
- `src/components/map/detail-modal.tsx`: `deal` prop — spotPickCard일 때 "🔥 특가"
  뱃지 + "🔥 <상품명> · 특가 보기" 제휴 링크 CTA(새 창).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 126 파일 1445건 통과(직전 1441 → +4: 폼 spot_id payload 2건,
  상세 카드 deal CTA 2건).
- `npm run build`: Compiled successfully. `/api/nearby/deal-spots` 등록 확인.

## 특이 사항
- `NearbyItem`에 이미 있던 `affiliate_url`(Decision 011, 파이프라인 미착수라 항상
  undefined)은 events 커머스 제휴용 별개 개념이라 건드리지 않고, 스팟픽 제휴 상품
  연동은 `curated_items.spot_id` 기반 별도 경로로 구현했다(RPC 변경 없이 얇은
  조회 엔드포인트 추가 — 회귀 위험 최소화).
- 실제 카카오 API 호출은 서버 키가 있는 환경에서만 — 로컬/CI에서는 SpotPicker
  외부 결과가 빈 배열이라 내부 검색만으로 정상 동작.
