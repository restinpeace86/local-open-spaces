- [x] **[Task 9-6-7] 오늘 전체보기+ 라우팅 원인 규명/완치 & "서울시 과천시" DB 데이터 오염 정정** 🚨 (2026-08-23 완료)
  - **작업 목표**: 오늘 전체보기+ 클릭 시 지도로 전환되는 근본 원인을 파헤쳐 완치하고, '서울대공원 테마가든' 등 행정구역 오염 레코드를 수리.

  - **세부 작업 지시**:
    1. **"오늘 전체보기+" 라우팅 실패 근본 원인 규명 및 수리**:
       - 단순 UI 파일 외에 전역 상태 관리, Middleware Redirect, Layout 인터셉트, 모바일/데스크톱 컴포넌트 분기 등 클릭 시 기존 지도로 라우팅되게 만드는 모든 근본 원인 추적.
       - 메인 피드 및 가성비 행복 섹션 등 홈 화면 내 모든 '전체보기+' 링크/버튼이 예외 없이 `/events/today`로 정상 전환되도록 완치.
    2. **"서울시 과천시" 데이터 오염 실측 및 DB 정정**:
       - `events` 및 `open_spaces` 테이블에서 `sido = '서울시'` AND `sigungu LIKE '%과천시%'` 또는 `venue_name ILIKE '%서울대공원%'` 레코드 실측.
       - 서울특별시 소속 기관이나 실제 위치가 경기도인 공간/이벤트의 `sido` 값을 `'경기도'`로 올바르게 DB UPDATE.
       - 메인 카드 표기 시 '경기도 과천시'로 올바르게 출력되는지 프론트엔드 검증.

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 홈 화면 클릭 실측을 통해 지도가 아닌 `/events/today` 전환 확인 및 '서울대공원' 카드 행정구역 표기 실측 결과 보고.

  - **(1) 라우팅 근본 원인(실측 규명)**: `home-view.tsx`가 넘기는 `heroMoreHref`(Task 9-6-6에서 이미 `/events/today`로 수정 완료)만 확인하고, `hero-carousel.tsx` 내부에 있는 **완전히 별도의 "Floating 오늘 전체보기" 버튼**(`src/components/home/hero-carousel.tsx:172`, 항목 10개 이하일 때도 항상 화면 우하단에 떠 있는 버튼)을 놓쳤던 것이 실제 원인이었다 — 이 버튼은 `moreHref` prop과 전혀 무관하게 `/nearby?filter=TODAY_WEEKEND`를 자체 하드코딩하고 있었다. 사용자가 실제로 눌렀던 것은 이 Floating 버튼일 가능성이 높다(마지막 슬라이드까지 넘겨야 나오는 CTA 카드와 달리 항상 보이므로). **수정**: 하드코딩을 제거하고 `moreHref ?? '/events/today'`로 통일 — `moreHref`가 있으면 그 값을(홈 화면의 CTA 카드와 동일 목적지), 없으면(항목 10개 이하) 기본값 `/events/today`를 쓴다. 기존 테스트(`hero-carousel.test.tsx`)가 이 하드코딩된 잘못된 href를 그대로 검증하고 있어 버그를 잡아내지 못했던 것도 확인 — 테스트를 실제 동작대로 갱신하고, `moreHref` 값을 그대로 따르는지 검증하는 테스트를 추가했다. `map-explorer.tsx`/`home-view.tsx`의 관련 주석도 더 이상 유효하지 않은 "Hero Carousel → 지도" 연동 설명을 정정했다.
  - **(2) "서울시 과천시" 데이터 오염(실측 규명 및 정정)**: 실제 DB 스키마에는 지시서가 언급한 `sido`/`sigungu` 컬럼이 존재하지 않는다(`sigungu_name` 하나뿐, "{시} {구}" 또는 "{시}" 단독 형식 — `project/database_schema.md` 기준. 다른 30여 개 경기도 도시도 전부 "경기도" 접두 없이 저장돼 있어, 검증 기준의 "'경기도 과천시'로 출력"이라는 표현은 이 DB의 기존 저장 관례와 맞지 않아 실제로는 관례대로 접두 없는 "과천시"로 정정했다 — 제5장 제4조 기존 구조 우선). 원인은 `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`(서울시 공공서비스예약 API 어댑터)가 "이 API는 서울만 다룬다"고 가정해 AREANM 필드에 무조건 `"서울시 "` 접두를 붙이고 있었던 것 — 실측 결과 이 API는 서울시가 운영/위탁하지만 실제로는 서울 밖에 있는 시설(서울대공원/서울동물원=경기도 과천시, "상주서울농장"=경상북도 상주시, 지자체 협약 캠핑장 등=충북 제천/전남 함평/경북 상주/충남 서천)도 함께 내려주고 있어, 전체 21,495건 중 **77건**이 "서울시 과천시" 같은 존재하지 않는 행정구역명으로 오염돼 있었다(과천시 23, 남양주시 31, 고양시 9, 상주시 4, 서천군 4, 제천시 2, 함평군 2, 포천시 2). **수정**: 어댑터에 `buildSigunguName()` 신규 추가 — AREANM이 서울 25개 자치구 중 하나일 때만 접두를 붙이고, 그 외에는 원본을 그대로 사용(상위 시/도를 추측해서 붙이지 않음). `scripts/migrations/2026-08-23-fix-seoul-yeyak-sigungu-contamination.sql`로 이미 적재된 77건을 일괄 정정(실측: 적용 후 "서울시 " 오염 잔존 0건, "서울대공원" 관련 11건 전부 `sigungu_name='과천시'`로 정상 표기 확인).
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 286/286 통과(hero-carousel.test.tsx 2건 갱신+1건 추가, seoul-yeyak-adapter.test.mjs 5건 추가), `npm run build` 통과. 개발 서버 기동 후 홈 화면 HTML을 직접 curl로 검사해 `/nearby` 링크 0건·`/events/today` 링크 2건(Floating 버튼 + CTA 카드) 확인, `/api/home/feed` 실측 호출로 서울대공원 관련 11개 카드 전부 `sigungu_name: '과천시'`로 정상 노출 확인.
  - **관련 파일**: `src/components/home/hero-carousel.tsx`(+test), `src/components/home/home-view.tsx`(주석), `src/components/map/map-explorer.tsx`(주석), `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`(+test), `scripts/migrations/2026-08-23-fix-seoul-yeyak-sigungu-contamination.sql`(신규).
