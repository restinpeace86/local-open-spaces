# 중분류 결과를 바텀시트 안으로, 페이지네이션을 무한 스크롤로 변경

## 구현 대상
사용자 지시(원문): "바텀시트에서 중분류 나오는데.. 중분류 누르면 데이터들이 바텀시트에서
나오는게 아니고 이벤트픽 화면에서 나오고 있어... 바텀시트에서 나오게 좀 해줘. 그리고
페이지네이션 더보기 버튼말고.. 무한 스크롤..? 바텀시트의 적절한 단위까지 끊어서 아래까지
다 내리면... 그때 더읽어오도록 은안돼?"

바로 이전 턴에서 "이벤트픽 대분류 탭 + 바텀시트 구조 복구"를 구현했지만, 그 구현은
바텀시트를 "중분류 칩만 고르는 곳"으로 두고 실제 결과 카드는 시트 밖(이벤트픽 본문,
`home-view.tsx`)에 렌더링했다 — 사용자가 원한 것은 결과 카드 자체도 시트 안에서
보이는 것이었다.

## 구현 일시
2026-09-04

## 변경 사항

### 1. 결과 카드를 바텀시트 안으로 이동
- `src/components/home/feed-card.tsx`(신규): `home-view.tsx`의 로컬 함수였던
  `FeedCard`(item_type에 따라 EventCard/SpaceGridCard 분기)를 공유 파일로 분리했다 —
  이제 `major-category-grid.tsx`도 같은 컴포넌트를 써야 하기 때문(제5장 제4조 기존
  구조 우선, 로직 변경 없이 위치만 이동).
- `src/components/home/major-category-grid.tsx`: `handleSelectMin`이 더 이상 시트를
  닫지 않는다(`setIsSheetOpen(false)` 제거) — 중분류를 선택해도 시트가 열린 채 남아,
  칩 목록 바로 아래에 결과 카드 그리드를 렌더링한다(로딩 중엔 스켈레톤, 0건이면 안내
  문구, 카드를 누르면 `onSelectResultItem` 콜백). 데이터 조회 로직(`useCategoryFeed`)
  자체는 여전히 `home-view.tsx`가 담당하고, 그 상태와 콜백을 새 props
  (`categoryFeedItems`/`isCategoryFeedLoading`/`isCategoryFeedLoadingMore`/
  `categoryFeedHasMore`/`onLoadMoreCategoryFeed`/`onSelectResultItem`)로 받아 그리기만
  한다 — 새 props는 전부 옵셔널(기본값 있음)로 둬 기존 칩 전용 테스트가 매번 다섯 개를
  채워 넣지 않아도 되게 했다.
- `src/components/home/home-view.tsx`: `<section aria-label="카테고리별 행사">` 안에서
  결과 카드를 직접 그리던 블록을 완전히 제거하고, `MajorCategoryGrid`에 위 props를
  넘기기만 한다.

### 2. "더보기" 버튼 → 스크롤 기반 무한 로딩
- `major-category-grid.tsx`의 시트 스크롤 컨테이너(`overflow-y-auto`)에 `onScroll`
  핸들러를 추가했다 — 스크롤 위치가 바닥에서 150px 이내로 가까워지면(`scrollHeight -
  scrollTop - clientHeight < 150`) `onLoadMoreCategoryFeed()`를 호출한다. 이미 더 볼
  결과가 없거나(`categoryFeedHasMore=false`), 이미 다음 페이지를 불러오는 중이면
  (`isCategoryFeedLoadingMore`) 중복 호출하지 않는다.
- IntersectionObserver 대신 스크롤 위치 직접 계산 방식을 택한 이유: 이 시트는 전체
  페이지가 아니라 자체 높이(`max-h-[70vh]`)를 가진 모달 안쪽 스크롤이라, 반복
  재관찰이 필요한 sentinel 패턴보다 스크롤 위치 계산이 더 단순하고 jsdom에서도 (스크롤
  값을 직접 주입해) 결정적으로 테스트할 수 있다.
- `home-view.tsx`의 "더보기" 버튼 마크업을 제거했다 — 데이터 페칭 자체(offset 기반
  `useCategoryFeed`)는 2026-09-04 오전 작업에서 이미 구현돼 있어 그대로 재사용했다
  (제5장 제4조 기존 구조 우선 — 트리거 방식만 버튼 클릭에서 스크롤 이벤트로 교체).

## 특이 사항
- 이 작업으로 대분류 그리드 칸 수 정합성 확인 및 결과 렌더 위치 이동이 함께
  이뤄지면서, `major-category-grid.test.tsx`의 "중분류 클릭 시 시트가 닫힌다"는
  옛 동작을 검증하던 테스트를 "시트가 닫히지 않고 열려 있다"로 뒤집었고, 결과 렌더링
  4종 + 무한 스크롤 4종 테스트를 새로 추가했다. `home-view.test.tsx`의 페이지네이션
  테스트도 버튼 클릭 대신 스크롤 이벤트를 발생시키는 방식으로 갱신했다(실제 스크롤
  임계값 판정 로직 자체는 major-category-grid.test.tsx에서 더 촘촘히 검증).
- 검증 중 `scripts/ingest/adapters/kma-weather-adapter.test.mjs`의 기존 테스트 1건이
  실패하는 것을 발견했다 — 이 세션의 변경과는 무관한, 이전부터 있던 문제다(같은 커밋을
  내 변경 없이 재현해도 동일하게 실패 확인). `withRetry`(재시도 유틸)의 실제 5초
  지연(2026-08-30 사용자 지시로 확정된 정책값)을 그 테스트가 fake timer 없이 그대로
  기다리다 vitest 기본 타임아웃(5000ms)과 충돌해 항상 실패한다 — 이번 작업 범위 밖이라
  손대지 않았고, 별도로 다뤄야 한다.
- 검증: `npx tsc --noEmit` 통과, `npm run test`(위 사전 확인된 무관 테스트 1건 제외
  1029개 통과), `npm run build` 프로덕션 빌드 통과. 브라우저 실기동 확인은 이 환경에
  브라우저/스크린샷 도구가 없어 수행하지 못했다 — 렌더링/스크롤 동작은 테스트가 검증한
  DOM 스냅샷과 시뮬레이션된 스크롤 이벤트로 대신 확인했다.
