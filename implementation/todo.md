- [x] **[Task 9-5-1] 목적별 테마 스팟 그룹화 피드 & 인앱 미니맵/네이버 지도 길안내 통합 연동** 🏞️ (2026-08-22 완료)
  - **완료 내역**:
    1. **목적/장소별 테마 스팟 그룹화**: 신규 `src/lib/theme-spots.ts`에 6대 테마(🏊 물놀이·수영장, 🛝 놀이터·키즈, 🌳 공원·산책, 🌲 숲·휴양림, 🎡 유원지·액티비티, 🏛️ 문화·체육)를 `source_type`(확정적인 소스, 실측 확인)과 이름 키워드(혼합 소스 KOR_TOUR_API_V4/GG_EVENTS/PUBLIC_FACILITY_OPEN용)로 분류. `get-home-feed.ts`의 신규 `getThemeSpotFeed()`가 상시 공간(open_spaces)과 오늘 개장 중인 시즌 행사(events)를 함께 조회해 통합 피딩(신규 `/api/home/theme-feed` 라우트). 메인 홈(`home-view.tsx`)과 카테고리 화면(`region-grid-view.tsx`) 양쪽에 "🏞️ 목적별 추천 스팟" 칩/타일 배치. `NearbyItem`에 `source_type?` 필드를 추가해(get-home-feed.ts/get-all-spaces.ts 경로만, `/nearby`의 RPC 경로는 이 Task 범위 밖이라 손대지 않음) 분류 근거로 사용.
       - **실측으로 발견하고 해결한 성능 문제**: `source_type IN (...) OR name ILIKE '%키워드%'`를 하나의 조건절에 섞으면 옵티마이저가 인덱스를 못 써 4초 이상 걸리고, 지역 필터까지 더하면 타임아웃이 났다 — 확정 소스 쿼리와 혼합 소스 한정 키워드 쿼리를 분리하고 `idx_open_spaces_source_type_created_at` 복합 인덱스를 추가해 해결(마이그레이션: `scripts/migrations/2026-08-22-theme-spot-source-type-index.sql`). 추가로 `LOCALDATA_PLAYGROUND`(전체의 63%)처럼 매칭 건수가 극단적으로 큰 소스는 관리 API로 돌린 EXPLAIN ANALYZE는 빨랐지만 실제 PostgREST(anon 롤) 경로에서는 여전히 타임아웃이 나는 것을 라이브 API 직접 호출로 재현·확인함 — `ORDER BY` 제거 및 `limit`을 500→100으로 낮춰 안정적으로 해결(6개 테마 전체 라이브 재검증: 모두 400~650ms 내 성공).
    2. **인앱 미니맵 & 크게보기 모달**: 신규 `src/components/map/mini-map.tsx`(단일 마커 콤팩트 Kakao 지도, 기존 지도 탐색용 `KakaoMapView`와 분리된 경량 버전)와 `map-preview-modal.tsx`(풀스크린)를 `detail-modal.tsx`의 위치 영역에 배치. `src/types/kakao.d.ts`에 `setDraggable`/`setZoomable` 타입 선언 추가(콤팩트 모드에서 확대/이동 비활성화).
    3. **네이버 지도 길안내 출발지 자동 매핑**: 신규 `src/lib/navigation.ts`의 `buildNaverMapDirectionsUrl()`이 네이버 공식 URL Scheme 문서(WebSearch/WebFetch로 직접 확인 — `guide.ncloud-docs.com/docs/maps-url-scheme`)를 따라 `slat`/`slng`/`sname`(출발지, 유저 전역 위치)와 `dlat`/`dlng`/`dname`(목적지)을 `nmap://route/car?...`에 채운다. `detail-modal.tsx`가 `useUserLocation()`의 좌표를 그대로 출발지로 연결. **한계 명시**: 네이버 공식 문서에도 PC/앱 미설치 환경용 대체 웹 URL이 없어(직접 확인) 임의로 만들지 않음 — 모바일 앱 설치 환경에서는 그대로 동작.
  - **검증 기준 결과**: `npx tsc --noEmit`, `npm run test`(24 files/210 tests 전체 통과 — `theme-spots.test.ts`/`navigation.test.ts`/`detail-modal.test.tsx` 신규 작성, `home-view.test.tsx`/`region-grid-view.test.tsx`/`get-home-feed.test.ts` 확장), `npm run build` 모두 통과. `npm run dev` 기동 후 6개 테마 칩 전체를 실제 `/api/home/theme-feed` 라이브 호출로 재검증(각 20건 반환, 모두 타임아웃 없이 성공), 네이버 길안내 링크(`slat`/`slng` 자동 채움)와 미니맵/크게보기 버튼도 실측 확인.

- [x] **[Hotfix] 홈화면 "This page couldn't load" 긴급 수리 & events 테이블 시군구/날짜 실측 감사** 🚨 (2026-08-22 완료)
  - **원인 진단(실측 재현)**: `npm run dev` 기동 후 `/api/home/feed`에 `sigungu` 쿼리 파라미터로 쉼표가 섞인 지역명(예: `"성남시, 분당구"`)을 넣으면 **항상 500**이 재현됨 — 응답 본문: `"failed to parse logic tree ((sigungu_name.ilike.%성남시,%,...))"`. 원인은 Task 9-4-4/9-5-1에서 도입한 `regionOrFilter()`가 `region.sigunguName`에서 뽑은 토큰을 이스케이프 없이 PostgREST `.or()` 필터 문자열에 그대로 삽입한 것 — PostgREST 문법에서 쉼표는 조건 구분자라 토큰에 쉼표가 있으면 필터 자체가 깨진다. 이 500 에러 JSON(`{error: "..."}`)을 `home-view.tsx`의 `fetch().then(res=>res.json()).then(data=>setHeroEvents(data.heroEvents))`가 배열 여부 검증 없이 그대로 세팅해 `heroEvents`가 `undefined`가 되고, 뒤이은 `heroEvents.slice(...)` 호출이 던지면서 홈 화면 렌더링이 통째로 크래시함(= "This page couldn't load"). sigunguName에 쉼표가 섞일 수 있는 경로: Kakao 키워드 검색 결과 주소에 건물/층수 부기가 남는 경우 등.
  - **수리 내역**:
    1. `get-home-feed.ts`에 `sanitizeRegionToken()` 추가(쉼표/괄호 제거) — `tokensOf()`가 토큰을 뽑을 때, `regionOrFilter()`가 필터 문자열을 만들 때 이중으로 적용(방어 2중화). 이제 사용자 지역명에 어떤 특수문자가 섞여도 PostgREST 필터가 깨지지 않는다(실측 재검증: comma/괄호 포함 케이스 전부 200 응답으로 전환됨 — `/api/home/feed`, `/api/home/free-feed`, `/api/home/theme-feed` 전부 재확인).
    2. `home-view.tsx`의 세 군데 fetch 핸들러(Hero 재조회, 가성비 행복, 목적별 추천 스팟) 모두 응답이 배열인지(`Array.isArray`) 검증한 뒤에만 상태를 세팅하도록 방어 로직 추가 — 서버가 어떤 이유로든 에러 응답을 반환해도 클라이언트가 크래시하지 않고 기존 상태를 유지한다.
    3. `src/app/page.tsx`의 초기 `getTodayEvents()` 호출을 try-catch로 감싸 실패 시 빈 배열로 폴백(제11조 오류 처리 원칙 — DB 문제 등 예기치 못한 상황에서도 홈 화면 자체는 항상 뜨도록 안전망 추가).
    4. `/api/home/free-feed`(및 `/feed`, `/theme-feed`) 라우트는 이미 전체를 try-catch로 감싸고 있어 쿠키/파라미터 파싱 예외 자체는 서버를 죽이지 않음을 재확인 — 이번 크래시의 실제 원인은 서버가 아니라 클라이언트의 응답 검증 누락이었음(정직히 기록).
    5. `get-home-feed.test.ts`에 회귀 테스트 추가(쉼표 섞인 sigunguName으로도 `.or()` 필터가 깨지지 않고 정상 resolve됨을 검증).
  - **`events` 테이블 시군구/날짜 실측 감사 결과**:
    | 항목 | 값 |
    |---|---|
    | events 전체 건수 | 24,477건 |
    | 오늘(2026-08-22) 활성(start_date≤오늘≤end_date) | 4,810건 |
    | is_active=true | 22,842건 |
    | start_date/end_date가 NULL인 행 | 0건(날짜 파싱 결측 없음) |
    | sigungu_name이 NULL인 행 | 2,781건(11%) — Task 9-4-4에서 이미 문서화된 VWorld 백필 미완료분과 별개로도 정상 매칭 가능 |

    소스별(external_id 접두어 기준) 분해:
    | 추정 소스 | 전체 건수 | 성남시 건수 |
    |---|---|---|
    | SEOUL_CULTURE(서울 문화행사) | 18,961건(77.5%) | 0건 |
    | SEOUL_YEYAK(서울 공공서비스예약) | 2,727건(11.1%) | 0건 |
    | TourAPI Festival(전국) | 2,789건(11.4%) | 1건 |

    경기도 주요 시군구 Group By(전체/오늘활성): 성남시 분당구 1/0, 수원시(전체) 1/1, 수원시 영통구 1/1, 수원시 팔달구 5/1, 용인시 처인구 1/0, 고양시 덕양구 1/0, 고양시 일산동구 1/0. **부가 발견(별건 데이터 품질 이슈, 이번 작업 범위 밖이라 수정하지 않고 기록만 함)**: `sigungu_name='서울시 고양시'`(9건, 전부 오늘 활성)라는 잘못된 값이 존재 — 고양시는 경기도 소속인데 "서울시" 접두어가 잘못 붙은 사례로, 별도 조사가 필요.
  - **성남시 이벤트 희소 원인 규명(결론)**: **DB 적재 자체 부족(구조적 소스 범위 한계)이며, 날짜 파싱 오류가 아님.** 근거: (1) `tour-api-festival.mjs`(전국 대상 유일한 비-서울 전용 소스)를 직접 코드 리뷰한 결과 지역 제한(`areaCode` 하드코딩) 없이 전국을 페이지네이션으로 전량 수집하고, `eventstartdate`/`eventenddate`를 표준 `YYYYMMDD→YYYY-MM-DD` 변환으로 정확히 파싱함(파싱 버그 없음, null_dates=0으로도 교차 확인). (2) 실측으로 TourAPI(`searchFestival2`)를 직접 호출해 확인한 결과, 현재 시점 기준 경기도 전체(`areaCode=31`)의 `eventStartDate>=오늘` 조건 매칭 건수가 **0건**(전국 244건 중 경기도 배정 0건) — 우리 어댑터의 결함이 아니라 TourAPI 원본 데이터 자체가 이 시점에 경기도/성남시 축제 정보를 거의 보유하지 않음을 실측 확인. (3) `events` 전체의 88.6%가 애초에 서울 전용으로 설계된 두 소스(SEOUL_YEYAK/SEOUL_CULTURE)이며, 이는 `project/data_sources.md`에 이미 "산림청/네이버 Local API 등 신규 데이터 소스 — 미착수"로 문서화된 알려진 로드맵 공백이다(임의 판단이 아니라 기존 문서에도 있는 계획된 확장 항목). **결론: 코드 버그가 아니라 데이터 소스 포트폴리오의 구조적 한계이며, 해결하려면 Gyeonggi-do 전용 이벤트 소스(예: 경기데이터드림 이벤트 API) 신규 수집 어댑터 추가가 필요 — 이는 새로운 데이터 소스 도입 결정이라 Spec 승인 없이 임의로 착수하지 않음(제3장 제2조 Spec 우선).**
  - **검증 기준 결과**: `npx tsc --noEmit`, `npm run test`(211 tests 전체 통과 — 신규 회귀 테스트 포함), `npm run build` 모두 통과. `npm run dev` 기동 후 comma/괄호 포함 지역명 케이스 전부(`/api/home/feed`, `/free-feed`, `/theme-feed`) 200 응답으로 재검증, 홈페이지 최종 HTML도 정상 렌더링(스켈레톤/실데이터 정상 스트리밍) 확인.
