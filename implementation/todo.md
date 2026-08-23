- [x] **[Task 9-6-7] 메인 피드 및 "가성비 행복" 섹션 행정구역 계층 필터 완치 + 라우팅 수리** 🚨 (2026-08-23 완료)
  - **작업 목표**: "서울형 키즈카페 서초구 양재1동2호점" 등 타 지자체 데이터 오피딩 버그 완치, "가성비 행복" 섹션 계층 필터 적용 및 `/events/today` 라우팅 수리.

  - **세부 작업 지시**:
    1. **버그 원인 실측 및 메인 피드 API 수리 (`get-home-feed.ts` / `/api/home/free-feed` / `/api/home/theme-feed`)**:
       - '성남시 분당구' 설정 시 "서울형 키즈카페 서초구 양재1동2호점"이 노출되는 쿼리 경로 직접 추적.
       - 메인 피드 쿼리에 행정구역 계층 필터 강제 적용: `1순위: 성남시 분당구` ➔ `2순위: 성남시` ➔ `3순위: 경기도`. 서울시 등 타 지자체 데이터 완전 Exclude.
    2. **"💰 가성비 행복" 섹션 계층 필터 동일 적용 (`getFreeFeed` / `home-view.tsx`)**:
       - 가성비 행복 섹션 피딩 쿼리에도 동일한 행정구역 계층 정렬 및 타 지자체 차단 필터 적용 (성남시 분당구 ➔ 성남시 ➔ 경기도 순).
    3. **"오늘 전체보기+" 버튼 라우팅 검증 (`home-view.tsx`)**:
       - 버튼 클릭 시 지도가 아닌 신규 전용 카드 그리드 페이지(`/events/today`)로 정상 연결되는지 클릭 실측 검증.

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - '성남시 분당구' 설정 후 메인 피드 및 가성비 행복 섹션 실측 호출 시 서울시 데이터 0건 반환 및 `/events/today` 연결 성공 보고.

  - **버그 원인(실측 추적)**: Task 9-6-6에서 `HomeRegion.provinceMembers`를 추가했을 때 `/events/today`(신규 페이지)만 이 필드를 명시적으로 넘겼고, 홈 화면 Hero Carousel(`getTodayEvents(HERO_FETCH_LIMIT)` → `DEFAULT_HOME_REGION`)과 "가성비 행복" 섹션(`getFreeFeed`)은 이 필드를 넘기지 않는 기존 호출부라 `fetchRegionFirstRows`의 3순위(부족분 채우기) 조회가 여전히 "지역 제한 없는 전체 조회"로 폴백했다 — 그래서 서울 데이터(예: "서울형 키즈카페 서초구 양재1동2호점")가 후보군에 들어와 노출됐다. 호출부마다 provinceMembers를 넘기도록 강제하는 방식은 이번처럼 넘기는 걸 잊으면 같은 버그가 재발하는 구조적 결함이라, 근본 수정은 "호출부가 무엇을 넘기든 안전하게" 만드는 것으로 판단했다.
  - **수정**: `src/lib/geo/region-hierarchy.ts`에 `resolveProvinceMembers(sigunguName)` 신규 추가 — sigunguName 문자열만으로 경기도 31개 시/군 또는 서울 25개 자치구 소속 여부를 자동 판별한다(인식 불가능한 지역은 undefined 반환 — 추측 금지, 기존 폴백 유지). `get-home-feed.ts`의 `fetchRegionFirstRows`가 3순위 조회 시 `region.provinceMembers`(명시적 override)가 없으면 이 자동 판별 결과를 대신 쓰도록 수정 — `getTodayEvents`/`getFreeFeed`/`getUpcomingDeadlineFill` 등 이 함수를 공유하는 모든 호출부(Hero Carousel, 가성비 행복 섹션, `/events/today` 전부)가 코드 변경 없이 한 번에 수정됐다(단일 지점 수정, 제5장 제4조).
  - **테스트 보강**: 기존 "Task 9-4-3"(3순위 폴백) 테스트가 실제로는 비필터링 스텁(`makeChainable`)을 써서 SQL 단 지역 필터링을 전혀 검증하지 못했던 것이 이 버그가 테스트로 잡히지 않은 원인 중 하나임을 확인 — 실제 쿼리 필터링을 시뮬레이션하는 `makeFilteringChainable`로 교체하고, "완전히 다른 지역" 예시를 서울(강남구, 이제 정당하게 차단 대상)에서 도내 다른 시(수원시)로 바꿔 원래 검증 취지(3단계 순서)를 유지했다. provinceMembers 자동 판별 성공/인식 불가 지역 폴백 유지 2건, 쉼표 섞인 지역명 테스트의 관련 없는 3순위 필터 조건 수 검증 로직도 함께 보정.
  - **라이브 검증(실측)**: 개발 서버 기동 후 `/api/home/feed`(Hero Carousel, 기본 성남시 분당구) 30건, `/api/home/free-feed`(가성비 행복) 12건 전수 조사 — 서초구 관련 항목 0건, 등장한 `sigungu_name`이 전부 경기도 31개 시/군(또는 그 소속 시설을 서울시가 운영하는 경우의 "서울시 OO시" 표기)뿐임을 확인. `/events/today`(기본/서초구 옵션 모두)와 홈 화면의 `/events/today` 링크는 회귀 없이 정상 동작함도 함께 재확인.
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 280/280 통과, `npm run build` 통과.
  - **관련 파일**: `src/lib/geo/region-hierarchy.ts`(+`resolveProvinceMembers`), `src/lib/home/get-home-feed.ts`(+test).
