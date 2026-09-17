# [제휴 상품 성격 이원화(기간한정 특가 vs 상시 티켓) + 상세 뷰 도입]

## 구현 대상
`implementation/todo.md` [개선사항 1][개선사항 2] (2026-09-17 등록):
"이벤트픽 화면에서 제휴상품등록한것들이 '이번주말 실패없는 베스트 나들이 픽'에 다
노출되던 기존 방식을 갈아엎고, 상품의 성격(기간한정 특가 vs 상시 티켓)에 따라
노출 위치와 큐레이션 전략을 이원화"하고, "프리뷰 카드를 클릭했을 때 곧바로 외부
링크로 이동하는 대신, 내부 상세 뷰를 거쳐 상품 정보를 확인한 뒤 외부 구매 링크로
이동하는 구조"로 개편하는 작업.

## 구현 일시
2026-09-17

## 문제 인식
직전 세션에서 마이리얼트립 제휴 상품(주로 상시 운영 키즈카페 이용권)을 대량으로
`curated_items`에 등록하기 시작하면서, "이번 주말 실패 없는 베스트 나들이 픽" 단일
섹션에 시한성 특가와 상시 티켓이 구분 없이 섞여 "에디터가 엄선한 나들이 코스"라는
큐레이션 신뢰감이 옅어지고 "그냥 상시 판매 티켓 나열"처럼 보이는 문제가 있었다
(사용자와의 사전 논의에서 확인).

## 변경 사항

### 데이터베이스
- `scripts/migrations/2026-09-17-curated-items-price-description.sql`: `curated_items`에
  `price_display`, `description` 컬럼 추가 — 지금까지 마이리얼트립 검색 결과의
  가격/설명이 등록 시 버려지고 있었다(제목/이미지/링크만 저장). `src/types/
  database.types.ts` 재생성 완료.

### 데이터 이원화 기준
- 새 플래그를 추가하지 않고, 이미 존재하던 `operation_end_date` 유무 하나로
  분류한다 — 있으면 "기간한정 특가", 없으면(상시 노출) "상시 티켓"
  (`src/lib/home/curated-items.ts`의 `splitCuratedItemsByPeriod`, 순수 함수 + 단위
  테스트).

### 관리자 화면
- `curated-item-form-modal.tsx`: "가격 표시"(텍스트), "상세 설명"(textarea) 입력
  필드 추가. `src/lib/admin/myrealtrip-search.ts`의
  `mapSearchItemToCuratedItemPrefill`이 검색 결과의 `priceDisplay`와(옵션 인자로
  받은) 상세 조회 `description`을 prefill에 함께 채운다.
- `/api/admin/curated-items` (POST/PATCH): `price_display`/`description` 저장 지원.

### 공개 API
- `/api/curated-items` (GET): 스팟 조인(`spot:open_spaces(id, name, address)`)을
  추가해 카드/상세에 "장소" 정보를 보여줄 수 있게 했다(관리자 API와 동일한 조인
  패턴 재사용, 제5장 제4조).
- **재확인**: "start_date도 있을 경우는 지나야 노출 시작"하는 로직은 기존
  `.or()` 두 개(시작일 없거나 오늘 이하 AND 종료일 없거나 오늘 이상)로 이미
  정확히 구현돼 있음을 코드 재검토로 확인 — 코드 변경 없음.

### 홈 화면(`home-view.tsx`, `best-pick-slider.tsx`, 신규 `curated-item-detail-modal.tsx`)
- 기존 "이번 주말 실패 없는 베스트 나들이 픽" 자리(현재 이용 가능 아래 · 예약 가능
  위)에는 **기간한정 특가만** 남기고, 타이틀/부제를 "엄선된 기간 한정 특가 픽" /
  "아이와 함께 가기 좋은 한정기간 추천 픽만 모았어요."로 변경.
- 메인 피드 맨 하단(예약 가능 섹션 다음, 숨김 처리된 테마별 섹션보다 위)에 신규
  "🧸 언제 가도 좋은 상시 추천 픽" / "마감 걱정 없이, 아이와 언제든 떠날 수 있는
  스테디셀러 티켓이에요." 섹션을 추가해 상시 티켓을 분리 고정 노출.
- 두 섹션 모두 기존 가변 노출 원칙(로드 전 스켈레톤, 0건이면 섹션 숨김) 그대로 유지.
- 카드(`BestPickSlider`)는 이제 `<a target="_blank">` 직접 이동이 아니라
  `onClick`으로 부모의 `onSelect`를 호출 — 신규 `CuratedItemDetailModal`(이미지/
  성격 뱃지/타이틀/가격/퀵인포 박스(위치·기간·타겟 코멘트)/설명/하단 고정 CTA)을
  먼저 연다. 실제 외부 이동은 이 모달의 CTA(`예매하러 바로가기 ↗`, `target="_blank"
  rel="noopener noreferrer"`)에서만 일어난다.
- 카드 텍스트 영역에 가격(`price_display`)/장소(`spot.address` 우선, 없으면
  `spot.name`)/기간(있을 때만) 텍스트를 추가 — "다른 영역(EventCard)이랑 비슷한
  구조" 요구사항 반영.
- **뱃지 제안**(todo.md "상품 성격에 따른 뱃지 필요한가? 제안할 것"): 카드/상세
  모두에 `operation_end_date` 유무 기준의 "⏰ 기간한정"/"🧸 상시" 배지를 이미지
  좌상단에 추가 제안·적용 — 두 섹션이 나뉜 지금은 어느 카드가 어느 성격인지 카드
  자체에서도 바로 구분되는 게 낫다고 판단했다(섹션 타이틀과 중복되지만, 이후 두
  섹션 카드가 한 목록에 섞여 노출될 가능성을 대비).
- 👶 타겟 포인트 코멘트는 상품마다 별도 저장 컬럼을 새로 만들지 않고(제5장 제7조 —
  지금 범위를 넘는 확장 자제), 이미 존재하는 섹션별 고정 부제 문구를 그대로
  재사용했다(상시/특가 성격별로 이미 그 의미를 담고 있음).

## 스킵한 항목
[개선사항 3](메인 피드 프리뷰 카드 뱃지 정리)은 **Decision 012/013과 직접 충돌해
스킵**했다 — `implementation/todo.md`에 스킵 사유를 별도로 기록.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 전체 160개 파일 / 1856개 테스트 통과(기존 1846개 대비 신규 10개:
  `curated-items.test.ts` 4개, `curated-item-detail-modal.test.tsx` 5개,
  `myrealtrip-search.test.ts` 1개 추가, `home-view.test.tsx`/
  `curated-item-form-modal.test.tsx` 기존 테스트 갱신).
- `npm run build`: 통과.
- 실제 개발 서버(localhost:3000)에서 라이브 확인:
  - `GET /api/curated-items` 응답에 `spot`/`price_display`/`description` 필드
    정상 포함 확인.
  - 홈 화면 서버 렌더링 HTML에 "엄선된 기간 한정 특가 픽"/"언제 가도 좋은 상시
    추천 픽" 두 섹션 타이틀 모두 노출 확인.
  - Playwright로 실제 카드 클릭 → 상세 모달(`예매하러 바로가기 ↗`, `target="_blank"`,
    실제 마이링크 href) 오픈까지 전체 흐름 재현 확인.
