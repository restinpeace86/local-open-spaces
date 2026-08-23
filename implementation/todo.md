- [x] **[Task 9-6-9] 당일 한정 피딩, 서울/경기 수도권 통합 피딩 & 캐러셀 스크롤 이탈 일시정지** 🎯 (2026-08-23 완료)
  - **작업 목표**: 메인 당일 피드 조건 강화, 서울/경기 통합 피딩, 10개 고정 제거(가변 표출/0건 시 비노출) 및 캐러셀 이탈 시 자동슬라이드 멈춤으로 스크롤 튕김 방지.

  - **세부 작업 지시**:
    1. **메인 당일 피드 조건 강화 & 가변 수량 표출 (`get-home-feed.ts` / `hero-carousel.tsx`)**:
       - `end_date = CURRENT_DATE` 또는 당일 한정 이벤트만 피딩.
       - 10개 수량 강제 조율 로직 배제: 조건에 부합하는 이벤트가 0건이면 섹션 비노출, N건이면 N개만 가변 표출.
    2. **서울/경기 수도권 통합 피딩 적용**:
       - 선택 지역이 서울특별시/경기도 소속일 경우 서울+경기 권역 전체 데이터를 통합 피딩 (지방 데이터 차단 유지).
    3. **캐러셀 포커스/뷰포트 이탈 시 Autoplay 일시정지 (`hero-carousel.tsx`)**:
       - Intersection Observer 또는 Swiper Autoplay 옵션을 활용하여 캐러셀이 화면(뷰포트)을 벗어나면 자동 재생 즉시 멈춤.
       - 하단 섹션 탐색 시 캐러셀 타이머 동작으로 인한 화면 상단 스크롤 튕김 현상 완전 차단.

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 당일/마감 이벤트만 가변 표출되는지 실측 및 하단 스크롤 시 자동 슬라이드 일시정지 동작 실측 검증.

  - **(1) 당일 한정 조건 강화 + 10개 강제 채움 제거**: `get-home-feed.ts`의 `getTodayEvents` 쿼리를 `.lte('start_date', today).gte('end_date', today)`(당일 진행 중이면 몇 주짜리 장기 전시도 매일 노출)에서 `.eq('end_date', today)`(당일 한정 — 오늘이 마지막 날이거나 하루짜리 행사만)로 좁혔다. Task 9-1-9의 `getUpcomingDeadlineFill`/`HERO_MIN_COUNT`(부족분을 "이번 주 마감임박"으로 10개까지 채우던 로직)를 함수째로 삭제 — 이제 조건에 맞는 건수가 곧 최종 결과다. `home-view.tsx`는 `heroEvents.length > 0`일 때만 섹션을 렌더링해 0건이면 안내 문구 없이 섹션 자체를 숨긴다.
  - **(2) 서울/경기 수도권 통합 피딩**: `region-hierarchy.ts`에 `CAPITAL_AREA_MEMBERS`(경기도 31개 시/군 + 서울 25개 자치구 합집합) 신규 추가, `resolveProvinceMembers`가 경기/서울 둘 다 이 통합 목록을 반환하도록 변경 — Task 9-6-7이 도입한 "3순위 조회도 지역 목록으로 제한" 메커니즘은 그대로 두고 그 목록의 내용만 넓혔다(단일 지점 수정이라 getTodayEvents/getFreeFeed 등 이 메커니즘을 쓰는 모든 곳에 자동 적용). "지방"(부산·경남 등) 데이터는 여전히 차단됨을 테스트로 확인. `/events/today`의 `REGION_OPTIONS` 두 옵션(성남시 분당구/서울시 서초구)도 동일하게 통합 목록을 쓰도록 갱신.
  - **(3) 캐러셀 뷰포트 이탈 시 Autoplay 정지**: `hero-carousel.tsx`에 `IntersectionObserver`로 캐러셀 컨테이너 자체의 뷰포트 노출 여부(`isInViewport`)를 감시하는 훅을 추가, 기존 호버/터치 일시정지 상태(`isPaused`)와 OR로 합쳐(`isPaused || !isInViewport`) Autoplay 타이머를 제어한다 — 하단 "가성비 행복" 섹션을 스크롤로 감상 중 캐러셀이 화면 밖으로 나가도 `scrollIntoView()`가 계속 호출되며 화면이 위로 튕기던 버그를 근본 차단.
  - **실측 검증**: 개발 서버 기동 후 `/api/home/feed` 실제 응답 확인 — heroEvents 14건(10개 고정 아님, 가변), 전량 `end_date === 오늘`, 서울시 구(종로구/서초구/강동구 등)가 성남시 분당구 기본 설정에서도 정당하게 노출됨(수도권 통합 확인). 컴포넌트 테스트로 뷰포트 이탈/재진입 시 Autoplay 정지/재개를 검증(실제 브라우저 스크롤 이벤트는 curl로 재현 불가능해 IntersectionObserver 목으로 검증).
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 309/309 통과(hero-carousel 뷰포트 정지 테스트 1건 신규 + IntersectionObserver 전역 스텁 추가, get-home-feed 당일 한정/채움 제거/수도권 통합 테스트 갱신), `npm run build` 통과.
  - **관련 파일**: `src/lib/home/get-home-feed.ts`(+test), `src/lib/geo/region-hierarchy.ts`, `src/components/home/hero-carousel.tsx`(+test), `src/components/home/home-view.tsx`(+test).
