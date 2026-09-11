# 이벤트픽 전체보기 바텀시트 중분류 자동 포커스 + 로딩 스켈레톤 — Step 110

## 구현 대상
`implementation/todo.md` 개선사항4: "이벤트픽 '전체보기' 바텀시트 진입 시, 가장 왼쪽
중분류가 자동 포커스되면서 데이터를 불러오는 과정의 UX와 반응 속도를 개선" —
① 중분류 탭 초기 포커스 즉시 반영, ② 로딩 중 스켈레톤 UI, ③ 중복 fetch/렌더링 병목
점검.

## 구현 일시
2026-09-11

## 적용 범위 확인 (실측)
- "중분류"라는 용어를 실제로 쓰는 화면은 `MajorCategoryGrid`(이벤트픽 대/중분류 선택
  바텀시트)뿐이다 — `EventBrowseSheet`의 칩은 대분류(category_maj) 필터라 "중분류
  자동 포커스" 요구사항이 문자 그대로 적용되진 않는다. 다만 스켈레톤 UI(②)는 같은
  "전체보기 바텀시트" 계열이라 `EventBrowseSheet`에도 함께 적용했다(②는 컴포넌트를
  특정하지 않은 일반 요구사항).
- 실측 재확인 결과 "가장 왼쪽 중분류가 자동 포커스"되는 동작은 **기존 코드에 없었다**
  (대분류 클릭 시 `onSelectMaj`만 호출되고 `selectedMin`은 그대로 `null`로 남아 사용자가
  칩을 한 번 더 눌러야 결과가 로딩되기 시작했다) — 이 항목은 todo.md에 명시된 신규 요구
  기능으로 보고 추가했다(harness 규칙상 todo.md 자체가 최우선 작업 지시).

## 변경 사항
### `src/components/home/major-category-grid.tsx`
- `handleSelectMaj`: 대분류 클릭 시 `onSelectMaj` 직후 그 대분류의 **첫 번째(가장
  왼쪽) 중분류**로 `onSelectMin`을 곧바로 호출한다. `categoryCounts`로 0건인 중분류는
  건너뛰고 그다음 사용 가능한 중분류를 고른다(기존 칩 목록 필터 기준 재사용).
  `activeOption`(prop 기반)이 아니라 클릭된 `maj` 인자로 직접
  `CATEGORY_MAJ_OPTIONS`에서 찾는다 — controlled prop 패턴이라 클릭 시점엔 아직
  `selectedMaj` prop이 갱신 전이기 때문.
  - "Active 디자인이 지연 없이 즉시 반영"(요구사항 1)은 별도 지연 로직을 추가하는 게
    아니라, `onSelectMaj`/`onSelectMin`을 같은 이벤트 핸들러 안에서 동기 호출해 React가
    두 상태 갱신을 한 번의 리렌더로 배치 처리하도록 한 것으로 자연히 충족된다.
- 결과 로딩 스켈레톤을 `FreeFeedSkeleton`(2~4열 그리드, h-32 카드용) → 신규
  `EventListSkeleton`(1열 리스트, h-[76px] 행)으로 교체 — Step 109에서 결과 카드
  레이아웃을 1열로 바꿨는데 스켈레톤 모양이 그대로 그리드였던 불일치를 바로잡는다.

### `src/components/cards/event-list-skeleton.tsx` (신규)
- `EventListSkeleton({ label })` — `role="status"` 6행 펄스 애니메이션 블록. 기존
  `FreeFeedSkeleton`은 그리드 카드 전용이라 그대로 재사용하지 않고 목적이 다른
  스켈레톤을 새로 추가했다(제5장 제4조 — 다른 레이아웃 목적까지 억지로 공유하지 않음).

### `src/components/home/event-browse-sheet.tsx`
- 초기 로딩 시 텍스트("불러오는 중...") → `EventListSkeleton`으로 교체(빈 화면처럼
  보이지 않게). "더 보기" 페이지네이션 로딩 중 텍스트는 그대로 유지(이미 카드가 보이는
  상태라 스켈레톤이 필요 없음).

## 중복 fetch/렌더링 병목 점검 (요구사항 3, 코드 변경 없음)
- `MajorCategoryGrid`가 대분류를 클릭했을 때 호출하는 콜백 체인을 추적: `onSelectMaj`
  (HomeView의 `handleSelectMaj` → `setSelectedMaj` + `resetCategoryFeed()`, fetch 없음)
  + 새로 추가한 `onSelectMin`(→ `selectCategory` → fetch 1회) — 자동 선택을 추가해도
  fetch는 여전히 1회만 발생한다(중복 없음, 실측 확인).
- `EventBrowseSheet`는 `useEffect([mode, regionKey, selectedMaj])` 단일 지점에서만
  fetch하며 중복 트리거 지점이 없다.
- 결론: 실제 중복 호출 지점은 발견되지 않았다 — 코드 변경 없이 점검 결과만 기록한다
  (개선사항1과 동일한 처리 방식).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 129 파일 1477건 통과(신규 4건: 자동 포커스 2건, 스켈레톤 노출 2건).
- `npm run build`: Compiled successfully.

## 특이 사항
- 개선사항5(거리순 정렬 + 도 단위 1차 필터)는 백엔드 쿼리/API 변경이 필요한 별도
  범위라 이어서 다음 스텝으로 진행한다(제3장 제3조 MVP 우선 — 검증 가능한 단위로 분리).
