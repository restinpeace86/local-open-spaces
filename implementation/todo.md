- [ ] **[Task 9-3-1] 메인 홈화면 섹션별 지연 로딩(Lazy Loading) 및 이미지/렌더링 최적화** 🚀
  - **작업 목표**: 초기 진입 시 상단 Hero Carousel만 즉시 페칭/렌더링하고, 하단 피드 섹션은 스크롤 접근 시 지연 로딩하여 LCP 및 반응 속도 대폭 향상
  - **세부 작업 지시**:
    1. **섹션별 지연 로딩 (Section-level Lazy Loading)**:
       - `home-view.tsx` 내 하단 섹션("💰 가성비 행복", 카테고리별 피드 등)을 `Intersection Observer` 기반 Dynamic Import 또는 지연 페칭(Client-side Lazy Fetching)으로 분리.
       - 스크롤 도달 전에는 카드 형태의 Skeleton UI를 가볍게 노출하여 Layout Shift(CLS) 방지.
    2. **이미지 렌더링 최적화**:
       - `HeroCarousel` 상단 첫 번째 카드 이미지에만 `priority={true}` 부여.
       - 그 외 하단 카드 및 Carousel 슬라이드 이미지는 `loading="lazy"` 및 `sizes` 속성 보정으로 모바일 트래픽 최소화.
    3. **초기 페칭 페이로드 최소화**:
       - `get-home-feed.ts` 초기 호출 시 상단 `HeroCarousel` 10건 데이터만 우선 반환하고, 하단 섹션 데이터는 스크롤/탭 전환 시 개별 API로 지연 분리 호출.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 라이브 dev 서버 모바일 Network 탭에서 초기 진입 시 페이로드 감소 확인 및 스크롤 시 하단 데이터 지연 페칭 동작 실측 검증.
