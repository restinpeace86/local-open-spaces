# [개선사항 6] 스팟픽 지도 4대 대분류 필터 + 바텀시트 구현

## 구현 일시
2026-09-03

## 배경
이전에 이 항목은 2026-08-29에 명시적으로 철회된 "대분류→중분류 2단 구조"를 다시
도입하라는 요구라 판단해 스킵하고 사용자 확인을 요청했다. 사용자가 "작년 8월 디자인
(플랫 단일 탭) 대신, 이번에 새롭게 기획한 4대 대분류 탭 + 클릭 시 바텀시트로 하위
중분류 노출 구조로 가는 것이 맞다"고 명시적으로 확인해, 이번에 실제로 구현했다.

## 대분류 taxonomy 설계 (실측 기반)
`select category_min, count(*) from open_spaces where location_precision='EXACT'
group by category_min`로 실제 분포를 확인한 뒤, 요구사항 순서(키즈/놀이시설 → 농장/체험
→ 자연/공원 → 문화시설) 그대로 기존 11개 핵심 중분류를 재배치하고, 목적이 명확하고
데이터가 유의미한 항목(49~495건)을 추가로 편입했다:
- **농장/체험**: 기존엔 이 대분류에 해당하는 칩이 하나도 없었다 — get-home-feed.ts의
  `SHARED_OPEN_SPACES_CATEGORY_MINS`(캠핑장/체험휴양마을/교육농장/체험학습장, 이미
  이벤트픽 "체험 / 농장" 대분류로 검증된 개념)를 그대로 재사용했다.
- **신규 편입**: 수목원/생태공원/전시실/공연장/과학관/역사유적지/물놀이시설(바닥분수).
- **편입 보류**: "관광명소"(256건)는 자연/문화 어느 쪽에도 확정하기 애매해(제3장 제5조
  추측 금지) 2026-08-29 큐레이션 철학(확실한 핵심 중분류만)을 따라 편입하지 않았다.

## 구현 내용
1. **`spot-category-groups.ts`**: `CORE_SPOT_CATEGORIES`는 계속 평평한 배열로 유지
   (다른 3개 소비처가 `.find(c => c.id === ...)`로 직접 참조하고 있어 트리 구조로
   바꾸면 전부 고쳐야 함 — 제5장 제4조 기존 구조 우선). 각 항목에 `major` 필드만
   추가하고, `getSpotCategoriesByMajor()`/`isSpotCategoryVisible()` 헬퍼로 대분류별
   그룹핑과 0건 제외 판정을 파생한다.
2. **`spot-category-filter.tsx`**: AI 추천 액션 + 4대 대분류 탭만 상시 노출. 대분류
   탭을 누르면 그 대분류의 중분류가 슬라이드업 바텀시트로 열린다 — 이벤트픽 홈 화면의
   `MajorCategoryGrid`(2026-09-01, 동일한 요구사항을 이미 한 번 해결한 컴포넌트)와
   완전히 동일한 오버레이+시트 패턴을 재사용했다(제5장 제4조). 중분류 선택 시
   `onSelectCategory` 호출 후 시트 자동으로 닫힘. 선택된 중분류가 속한 대분류 탭은
   대분류 라벨 대신 선택된 중분류 라벨을 보여준다(현재 필터 상태를 한눈에 확인).
3. **0건 중분류 제외**: `getSpotCategoryMinCounts()`(신규, `get-spot-category-counts.ts`)
   + `/api/nearby/spot-category-counts`(신규 라우트)가 전역(지역 무관) 카운트를
   계산해 바텀시트에서 0건인 중분류를 숨긴다 — 이벤트픽에 이미 적용된 동일 원칙
   (getCategoryMinCounts)의 스팟픽 버전.
4. **`map-explorer.tsx`**: 마운트 시 1회 카운트를 불러와 `SpotCategoryFilter`에
   전달한다(위치 무관, home-view.tsx의 categoryCounts와 동일 관례). 실제 minor 선택/
   필터링 로직(`selectedCategoryId`/`selectedCategoryMins`/`handleSelectCategory`)은
   전혀 바꾸지 않았다 — UI 진입 방식만 바뀌었을 뿐 필터링 자체는 기존 그대로다.

## 실측으로 발견해 수정한 성능 문제(요구사항에 없었지만 함께 고침)
0건 카운트 API를 처음 `count: 'exact'`로 구현했을 때, open_spaces(14만+ 행)에서 26개
중분류를 동시에 카운트하니 대형 중분류는 1~12초까지 걸렸고(`EXPLAIN ANALYZE`로 실측:
어린이놀이터 단독 11.7초) 일부는 동시 부하로 실패해 조회 실패 폴백값(1)을 반환했다
(라이브 curl로 실제 재현·확인). 정확한 카운트가 필요 없는 용도(0건인지 아닌지만
판단)이므로 실행 계획만 세우고 실제 스캔은 하지 않는 `count: 'estimated'`로 바꿨다 —
관리자 그리드(`/api/admin/data-grid`)가 이미 큰 open_spaces 조회에 쓰던 것과 동일한
기존 패턴이다(제5장 제4조). 전환 후 재측정 결과 추정치가 실제값과 거의 일치했고
(어린이놀이터 58,151 vs 실측 57,692) 실패 없이 안정적으로 응답했다.

## 검증
`npx tsc --noEmit`/`npm run test`(96파일 984건, 신규/재작성 테스트 다수 포함 —
`spot-category-groups.test.ts`/`spot-category-filter.test.tsx`/`map-explorer.test.tsx`의
관련 describe 블록을 새 2단 구조에 맞춰 재작성)/`npm run build` 통과.

라이브 dev 서버 실측: `curl /nearby`로 4대 대분류 탭이 렌더됨을 확인, `curl /api/nearby/
spot-category-counts`를 3회 반복 호출해 실제 카운트가 안정적으로 반환됨(추정치 오차
미미, 실패 0건)을 확인.
