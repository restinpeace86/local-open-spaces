# 스팟픽 상세 카드 재설계 (개선사항3 + 2-2 UI + 2-4 + 2-6) — Step 95

## 구현 대상
- **개선사항3** [스팟픽] 상세 카드 최종 UI: 뱃지 영역(3-2), 인터랙티브 거리/
  길찾기(3-3), 네이버 블로그 후기 동적 버튼(3-5), 예약 버튼 조건부(3-7).
- **개선사항2-2 UI 부분**: 구형 레거시 카테고리 뱃지 노출 차단.
- **개선사항2-4**: 상세 카드 하단 CTA — 외부 예약 링크 유무 조건부 + 인앱 길찾기.
- **개선사항2-6**: 마커 프리뷰 카드 ↔ 상세 카드 UI 일원화.

## 구현 일시
2026-09-10

## 설계 — `spotPickCard` prop
`DetailModal`은 홈 피드·이벤트픽·캘린더·지역별 그리드·스팟픽에서 공유하는
컴포넌트다. 개선사항3은 "[스팟픽] 상세 카드" 한정이므로, `spotPickCard?: boolean`
prop을 새로 두고 **`map-explorer.tsx`만** 이 값을 넘긴다(`hideMapSection`과 함께).
다른 화면은 prop 미전달 → 기존 렌더링/CTA/폴백 체인 그대로 유지 → 기존 테스트
전부 무변경 통과.

## 변경 사항
### `src/components/map/detail-modal.tsx`
- `SpotCuration` 타입에 `badge_labels?: string[]`, `min_age_recommended?: number | null`
  추가(`/api/spot-curations`가 이미 내려줌 — Step 92/기존 badge_labels).
- `spotPickCard` prop 추가 + 관련 파생값:
  - `spotBadgeLabels` / `minAgeRecommended` (스팟픽·공간일 때만 채움).
  - **뱃지 영역**: 스팟픽 카드는 `meta.label`(5대 UI 카테고리 — '야외·자연' 등)
    대신 `min_age_recommended > 0`이면 "만 N세 이상"(amber) + `badge_labels`
    회색 칩만. 무료/유료 칩은 유지.
  - **인터랙티브 거리**: `spotPickCard && hasExactLocation`이면 거리를
    "🧭 현재 위치에서 N · 길찾기 ›" 버튼으로 → `setIsMapPreviewOpen(true)`
    (인앱 지도/길찾기). 아니면 기존 단순 텍스트.
  - **예약 버튼**: `secondaryAction` 체인에 `spotPickCard ? null` 분기를 추가 —
    `info_url`도 `naver_booking_url`도 없으면 스팟픽 카드는 예약 버튼/안내
    텍스트를 아예 렌더링하지 않음(자체 간편 예약 폼 미노출). 다른 화면은
    기존 폴백(간편 예약 폼 → 안내 텍스트) 유지.
  - **네이버 블로그 후기**: `spotPickCard && !isEvent`일 때 `/api/spot-blog-reviews`
    (Step 94, 10일 TTL 캐시) 조회 → URL 개수만큼 "📝 블로그 후기 N" 새 창 링크
    (상호명·거리 아래, 기본 상세정보 위). 0건/실패면 영역 숨김. 새 창(`target=
    _blank`) 방식이라 뒤로가기 시 앱 상태가 그대로 보존된다(3-5 요구 충족).

### `src/components/map/map-explorer.tsx`
- `DetailModal`에 `spotPickCard` 전달.
- `handleMarkerSelectItem`: 마커 프리뷰용 `previewItem`에 기준점(GPS 또는 설정
  위치, `originLat/originLng`)으로부터의 실제 거리를 계산해 `distance_meters`로
  채워 넣음 — 노출 중분류 전역 조회는 서버 거리가 -1이라 프리뷰/상세 카드에서
  거리가 안 보였다. 이 카드를 눌러 여는 상세 카드도 이 값을 물려받는다.

### `src/components/map/marker-preview-card.tsx` (개선사항2-6)
- 상호명 + 거리(🧭 N km) 한 줄, 주소 다음 줄, 맞춤형 뱃지 — 상세 카드와 동일 구조.
- 주소가 없을 때 `meta.label`(구형 레거시 라벨)로 폴백하던 것 제거.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 122 파일 1428건 통과(직전 1426 → +2; detail-modal +7 신규,
  marker-preview-card +2, 그 외 조정 없음).
- `npm run build`: Compiled successfully.

## 범위 밖 / 후속
- **3-1 헤더 이미지 carousel**: 현재 `spot_curations.image_url`이 단수라 단일
  이미지(있으면 노출/없으면 Gone)로 스펙 최소 요건은 충족. 다중 이미지 슬라이드는
  이미지 데이터가 다건화되는 시점에 별도로.
- **2-5 지도 마커 광역 경계 제한**: "도 전역 노출" Decision과 상충 소지 — 여전히
  Decision 확인 대기(todo.md 기록).
- 데스크톱 좌측 `ItemListPanel`은 아직 province-wide `visibleItems` 사용 —
  모바일 바텀시트와의 완전 일치는 별도 판단.
