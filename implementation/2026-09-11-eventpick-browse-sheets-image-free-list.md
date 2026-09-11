# 이벤트픽 "전체보기" 바텀시트 4곳 이미지 없는 1열 리스트로 통일 — Step 109

## 구현 대상
`implementation/todo.md` 개선사항3: "전체보기 목록에 있는 미리보기 카드들이 각자 다르게
생겼다 — 이벤트픽 대/중분류 선택 바텀시트, '지금 이 순간 함께하기 좋은 알찬 픽'/'놓치면
후회하는 인기 만점 예약 픽'/'오늘 전체보기' 전체보기 4곳을 이미지 없는 1열 리스트(4단
라인 구조: 제목+거리 / 뱃지 / 행사·운영기간 / 예약기간)로 통일해 대량 리스트 렌더링
성능을 최적화한다."

## 구현 일시
2026-09-11

## 대상 범위 확인 (실측)
- `grep -rln "전체보기"`로 후보를 추리고 각 파일을 직접 읽어 4개 타겟이 실제로는
  컴포넌트 2개로 좁혀짐을 확인했다:
  - `EventBrowseSheet`(단일 컴포넌트, `mode` prop으로 `today`/`ongoing`/
    `reservation-open` 3종을 모두 처리) — "지금 이 순간 함께하기 좋은 알찬 픽 전체보기",
    "놓치면 후회하는 인기 만점 예약 픽 전체보기", "오늘 전체보기" 3곳.
  - `MajorCategoryGrid` — "이벤트픽 대/중분류 선택 바텀시트"(중분류 선택 시 결과를 시트
    안에 그리는 부분).
- 두 컴포넌트가 각각 `EventCard`/`FeedCard`(이미지 포함, 2~3열 그리드)를 썼다. 이
  둘은 가로 슬라이더 등 이미지가 필요한 다른 화면에서도 널리 재사용되는 공유
  컴포넌트라(`grep`으로 5곳 이상 확인) 직접 수정하면 다른 화면에 영향을 준다(제5장
  제4조 기존 구조 우선 — 기존 컴포넌트를 무리하게 뜯어고치지 않고 새 컴포넌트를
  추가) → 목적 전용 신규 컴포넌트로 분리하는 쪽을 선택.

## 변경 사항
### `src/lib/spaces/format.ts`
- `formatReservationPeriod(reservationStartDateTime, reservationEndDateTime)` 추가.
  `reservation_start_date`/`reservation_end_date`는 timestamptz라 `formatDateTime`처럼
  시:분까지 풀면 리스트 한 줄에 너무 길어진다 — 날짜 부분(`YYYY-MM-DD`)만 잘라 기존
  `formatDateRange`(이미 있는 "start ~ end" 포맷)를 그대로 재사용한다(제5장 제4조).

### `src/components/cards/event-list-row.tsx` (신규)
- 요구사항 원문 그대로 4단 라인 구조:
  1. 제목(왼쪽, Bold) + 현재 위치와의 거리(오른쪽, 서브 텍스트, `distance_meters`가
     -1(위치 미상)이면 숨김 — 기존 EventCard와 동일한 sentinel 규약).
  2. 뱃지 영역: 중분류(`category_min`, 없으면 대분류 라벨로 폴백) + `getParentalBadges`
     (기존 함수 재사용, SPACE/EVENT 각각의 뱃지 규칙을 그대로 물려받음).
  3. 행사/운영기간: `formatDateRange(start_date, end_date)`. 시작/종료일이 둘 다 없는
     경우(open_spaces 공유 상시 운영 항목, `event-status.ts getEventStatus`와 동일
     조건)에만 "상시"로 표시 — 새 문구를 지어내지 않고 이미 시스템에 존재하는 개념을
     재사용했다.
  4. 예약기간: `formatReservationPeriod`. 값이 없으면 이 줄 자체를 렌더링하지 않는다
     (없는 정보를 지어내지 않음, 제3장 제5조 추측 금지 — EventCard의 기존 조건부
     렌더링 패턴과 동일).
- **이미지 렌더링 로직 완전히 제거** — `<img>` 태그도, placeholder 아이콘 영역도 없다
  (요구사항 원문: "카드별 이미지 렌더링 로직은 완전히 제거").

### `src/components/home/event-browse-sheet.tsx`
- `EventCard` + `grid grid-cols-2 sm:grid-cols-3` → `EventListRow` + `flex flex-col
  gap-2`(1열 리스트)로 교체. 무한 스크롤/필터 칩/페이지네이션 등 다른 로직은 그대로
  유지(제5장 제4조 기존 구조 우선).

### `src/components/home/major-category-grid.tsx`
- `FeedCard`(EVENT/SPACE 타입 분기 후 EventCard/SpaceGridCard로 위임) +
  `grid grid-cols-2` → `EventListRow` + `flex flex-col gap-2`로 교체.
  `EventListRow`는 `NearbyItem` 공통 필드만 사용해 타입 분기 없이 그대로 재사용 가능.

## 건드리지 않은 것
- `EventCard`/`FeedCard`/`SpaceGridCard` 자체는 완전히 그대로 유지 — 다른 화면(가로
  슬라이더 등, 이미지가 필요한 곳)에서 계속 그대로 쓰인다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 129 파일 1474건 통과 (신규 `event-list-row.test.tsx` 7건 포함,
  기존 `event-browse-sheet.test.tsx`/`major-category-grid.test.tsx`는 텍스트/클릭
  기반 검증이라 컴포넌트 교체와 무관하게 그대로 통과).
- `npm run build`: Compiled successfully.

## 특이 사항
- 개선사항4(스켈레톤/탭 즉시 피드백/중복 fetch 정리)와 개선사항5(거리순 정렬 +
  도 단위 1차 필터)는 이 두 컴포넌트를 이어서 다루는 후속 작업이라 이번 커밋에는
  포함하지 않았다 — 범위를 좁혀 검증 가능한 단위로 나눈다(제3장 제3조 MVP 우선).
