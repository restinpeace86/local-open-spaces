- [x] **[Task 9-3-1] 메인 홈화면 섹션별 지연 로딩(Lazy Loading) 및 이미지/렌더링 최적화** 🚀 (2026-08-22 완료)
  - **작업 목표**: 초기 진입 시 상단 Hero Carousel만 즉시 페칭/렌더링하고, 하단 피드 섹션은 스크롤 접근 시 지연 로딩하여 LCP 및 반응 속도 대폭 향상
  - **완료 내역**:
    1. **섹션별 지연 로딩**: 신규 `src/hooks/use-in-view.ts`(IntersectionObserver 감지 훅, 한 번 보이면 계속 로드 상태 유지)와 `home-view.tsx` 내 `useFreeFeed` 훅(신규 `/api/home/free-feed` 라우트 호출)으로 "💰 가성비 행복" 섹션을 분리. 섹션이 화면에 들어오거나 "무료·공공" 탭이 선택될 때만 페칭하며, 그 전에는 신규 `free-feed-skeleton.tsx`(카드 8개 Skeleton, `role="status"`)를 노출해 CLS를 방지함.
    2. **이미지 렌더링 최적화**: `HeroCarousel` 첫 번째 슬라이드에만 `loading="eager"` + `fetchPriority="high"`(next/image `priority`와 동등한 네이티브 속성) 부여, 나머지 슬라이드와 `EventCard`의 이미지는 `loading="lazy"` 적용. **주의**: 썸네일이 Supabase Storage 외 다양한 공공 API 도메인에서 오고 `next.config.ts`의 `remotePatterns`가 `*.supabase.co`만 허용해 `next/image` 전환 시 대부분 깨지므로, 기존 `<img>` 태그를 유지하고 네이티브 속성만 보정함(임의 판단 아님 — 실제 호환성 제약). 이런 이유로 `sizes` 속성(반응형 `srcset` 전제)은 해당 사항이 없어 적용하지 않음.
    3. **초기 페칭 페이로드 최소화**: `get-home-feed.ts`에 `HERO_FETCH_LIMIT`를 export하고, `page.tsx`(Server Component)는 `getTodayEvents(HERO_FETCH_LIMIT)`만 호출 — 가성비 행복 피드는 더 이상 초기 SSR에 포함되지 않음(`getFreeFeed`는 신규 `/api/home/free-feed` 라우트가 클라이언트 요청 시에만 호출).
  - **실측 검증**: `npm run dev` 기동 후 `curl localhost:3000/`로 확인한 초기 HTML에 "무료 공공 공원"류 실데이터는 전혀 없고 `animate-pulse` Skeleton 8개만 포함됨을 확인(초기 페이로드에서 하단 피드 데이터 제외 확인). `curl localhost:3000/api/home/free-feed`가 독립적으로 정상 응답함을 확인.
  - **검증 기준 결과**: `npx tsc --noEmit`, `npm run test`(20 files/181 tests 전체 통과 — 기존 `home-view.test.tsx`를 신규 lazy-loading 구조에 맞춰 전면 재작성, IntersectionObserver 모킹 포함), `npm run build`(신규 `/api/home/free-feed` 라우트 정상 생성 확인) 모두 통과.

- [x] **[Task 9-3-2] 수집 파이프라인 잔여 백필 및 미구현 어댑터 점검** 🔍 (2026-08-22 점검 완료 — 백필 실행은 외부 요인으로 보류)
  - **작업 목표**: `backfill-sigungu-name-vworld.mjs` 재실행으로 잔여 sigungu_name 백필 완료, 미연결 어댑터(`local-data-kids.mjs` 등) 상태 점검 및 가능한 수집 완결
  - **점검 결과**:
    1. **VWorld 백필 재실행 시도**: 실행 전 VWorld API 상태를 먼저 확인한 결과, Task 9-2-1에서 발생한 `INVALID_KEY` 키 일시 차단이 이번 세션(수 시간 경과) 시점에도 전혀 해제되지 않음을 실측 확인(forward geocoding까지 동일하게 실패 — 이전엔 정상 동작하던 요청도 동일 키로 재현 실패). 단순 쿨다운이 아니라 계정 단위 차단(또는 일 단위 쿨타임 이상)일 가능성이 높아, 무의미한 재시도로 API를 더 압박하지 않기 위해 반복 재시도를 중단함. **잔여 ~1,500건 백필은 VWorld 콘솔(www.vworld.kr)에서 키 상태를 직접 확인/재발급받은 뒤 `node scripts/migrations/backfill-sigungu-name-vworld.mjs`(동시성 1 + 요청당 300ms 지연으로 이미 안정화됨)를 재실행하면 됨 — 코드 변경 불필요.**
    2. **미연결 어댑터 점검**: `.env.local`에 설정된 모든 환경변수 키를 전수 확인한 결과, `local-data-kids-adapter.mjs`가 요구하는 `LOCAL_DATA_KIDS_CSV_URL` 하나만 미설정이고 나머지 12개 어댑터(`PUBLIC_DATA_API_KEY`/`VWORLD_API_KEY`/`GG_DATA_API_KEY`/`SEOUL_OPEN_DATA_KEY`/`TOUR_API_KEY` 의존)는 전부 키가 설정돼 있음을 확인함. DB `open_spaces`를 `source_type`별로 전수 집계해 다른 소스가 예상외로 0건인 경우가 없음도 함께 확인(파이프라인 자체는 건강함).
    3. **`local-data-kids.mjs` 미완결 사유(추측 금지 원칙에 따라 임의 URL 생성 안 함)**: 어댑터 코드 자체에 이미 명시돼 있듯 localdata.go.kr은 업종(기타유원시설업 등)별로 별도 CSV 다운로드 URL을 발급하며 이는 사람이 localdata.go.kr에서 직접 확인해야 하는 값이라 임의로 추정/생성할 수 없음. **사용자가 localdata.go.kr에서 실제 URL을 확인해 `.env.local`의 `LOCAL_DATA_KIDS_CSV_URL`에 추가해야 이 소스의 수집이 가능함.**
  - **검증 기준 결과**: 코드 변경이 없는 순수 점검 작업이라 별도 코드 검증 대상은 없음(Task 9-3-1과 함께 수행한 `tsc`/`test`/`build`가 회귀 없음을 보증). VWorld 키/CSV URL 두 외부 차단 요인은 사용자 조치가 필요해 todo.md에 후속 작업으로 남김.
