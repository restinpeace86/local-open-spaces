# Task 9-1: 하단 5탭 내비게이션 + 홈 화면(야놀자/여기어때 스타일) 신규 구현

## 구현 대상
- `implementation/todo.md` [Task 9-1]: Decision 008로 확정된 홈 화면(Hero Carousel + 5대 카테고리 Quick 그리드 + 큐레이션 피드)과 하단 5탭 고정 내비게이션 신규 구현

## 구현 일시
2026-08-22

## 배경
`project/overview.md`/`implementation/todo.md`에 "미착수(범위가 커서 화면 목업/우선순위를 사용자와 먼저 확정한 뒤 착수)"로 보류돼 있던 항목을, 사용자가 화면 목업/우선순위를 명시적으로 확정 지시(2026-08-22)하며 보류를 해제하고 착수를 요청함.

## 변경 사항

### 라우팅 재구성
- 기존 `/`(지도 탐색, `MapExplorer`)를 `/nearby`로 이동
- 기존 `/region`, `/calendar`를 `src/app/(explore)/` 라우트 그룹으로 이동(URL은 그대로 유지, 폴더 구조만 그룹화)
- `/`(신규 홈)이 새로운 디폴트 라우트가 됨
- 기존 상단 3탭(`TopTabs`, 지도/도감/캘린더)은 폐기하지 않고 `(explore)/layout.tsx`로 옮겨 지도/도감/캘린더 사이의 서브 내비게이션으로 유지(Decision 008 "기존 지도/도감/캘린더 뷰는 폐기가 아니라 새 탭 구조 안으로 재배치")

### 데이터 레이어
- `src/lib/home/get-home-feed.ts`: `getTodayEvents()`(오늘 진행 중 + 예약 마감건 제외), `getFreeFeed()`(is_free=true 공간+행사 병합), `getHomeFeed()`
- `src/app/api/home/feed/route.ts`: 위 로직을 그대로 재사용하는 GET API(클라이언트 재조회용)
- `src/app/page.tsx`: Server Component에서 `getHomeFeed()`를 직접 호출(자기 자신을 fetch하는 안티패턴 회피)

### UI 컴포넌트
- `src/components/home/home-header.tsx`: 위치 선택기(`LocationHeader` 재사용) + 검색바(입력 시 `/nearby?q=`로 라우팅)
- `src/components/home/home-sub-tabs.tsx`: 홈/특가·핫딜(비활성)/무료·공공 3탭
- `src/components/home/hero-carousel.tsx`: 대형 썸네일 + `⚡ 오늘 당일 입장`/`🎁 무료` 뱃지 + 행사명 + 거리(가로 스크롤)
- `src/components/home/quick-category-grid.tsx`: 5대 UI 카테고리 아이콘 그리드, `/region?category=X`로 연결
- `src/components/home/home-view.tsx`: 위 컴포넌트를 조합하는 클라이언트 오케스트레이터(서브탭 전환, 상세 모달, 위치 온보딩 모달 관리)
- `src/components/cards/event-card.tsx`(신규): `spec/event/event-card.md` 준용 — 썸네일, 카테고리+상태 뱃지, 예약 마감 경고, Parental Checkpoint 뱃지
- `src/components/region/space-grid-card.tsx`(개선): 거리 표시 추가, 뱃지 emphasis 스타일 지원 추가
- `src/components/nav/bottom-tabs.tsx`(신규): 하단 5탭([카테고리]-[내주변]-[홈]-[찜]-[마이]), 찜/마이는 Feature Flag로 비활성 표시
- `src/lib/feature-flags.ts`(신규): `spec/common/feature-flags.md`가 문서로만 있고 실제 구현 코드가 없었음 — 처음 구현

### 기존 코드 연동 보강
- `src/components/map/map-explorer.tsx`: `useSearchParams()`로 홈 검색바의 `?q=` 초기값 반영
- `src/components/region/region-grid-view.tsx`: `useSearchParams()`로 홈 Quick 그리드의 `?category=` 초기값 반영
- `src/lib/spaces/category-meta.ts`: `UI_CATEGORY_FILTER_OPTIONS`(5대 UI 카테고리, docs/spec.md 3.2 순서) 추가
- `src/lib/spaces/parental-badges.ts`: 아래 "발견한 Mismatch" 2건 수정

## 발견한 Mismatch (docs/spec.md ↔ 실제 구현/DB, 지시 #6)

1. **`booking_status` 표시 문구 불일치**: DB 실제 저장값(`오늘방문`/`D-1 마감임박`/`접수중`/`null`, `scripts/ingest/lib/ai-tagging.mjs`)과 스펙 표시 문구("오늘 당일 입장 가능" 등)가 다른데, 기존 프론트 코드는 원본값을 그대로 노출하고 있었다. `BOOKING_STATUS_LABEL` 매핑을 추가해 수정. `'주말예약'`(실제 미생성 값)은 제거, "사전 예약 필수"(ETL이 별도 생성 안 함)는 매핑하지 않고 원본값 유지.
2. **event 카드 `is_free` null 처리 버그**: `getEventBadges()`가 `is_free === null`을 유료로 오판정하던 실제 버그를 발견해 수정(space 카드는 이미 null 숨김 처리가 있었는데 event만 누락돼 있었음). `is_free: null`인 실제 레코드(SEOUL_CULTURE 6건)가 존재해 실질적인 오탐이었다.
3. **`events` 테이블에 장소(venue) 컬럼 부재**: `event-card.md`/Hero Carousel 스펙 모두 "장소" 표시를 요구하나, 실제 쿼리로 확인한 결과 `space_id` FK가 채워진 이벤트가 **0건**이라 장소명을 끌어올 방법이 없다. 거리 정보로 대체하거나 "장소 정보 없음"으로 정직하게 표시(가짜 장소명 생성 안 함). 근본 해결은 ETL 단에서 원본 장소 필드를 컬럼화하는 별도 작업 필요.
4. **가성비 3단계 배지 구현 불가**: `docs/spec.md` 3.2는 "🎁 완전무료/💰 1만원 이하/🎟️ 유료" 3단계를 요구하나 두 테이블 모두 숫자 요금 컬럼이 없어(대부분 어댑터가 애초에 숫자 요금을 수집하지 않음) 무료/유료 2단계만 구현 가능.
5. **`/region` 필터 칩이 5대 UI 카테고리를 몰랐음**: 필터링 자체(URL `category` 파라미터 초기값 반영)는 정상 동작하도록 연동했으나, 필터 칩 UI(`SPACE_CATEGORY_FILTER_OPTIONS`)는 여전히 레거시 3종만 나열해 Quick 그리드로 진입 시 어떤 칩도 "선택됨"으로 보이지 않는다.

## 검증 결과
- `npx tsc --noEmit`: 통과(단, `.next` 캐시에 남아있던 이동 전 라우트의 stale 타입 아티팩트 때문에 처음엔 에러가 났음 — `.next` 삭제 후 재검증해 해결, 코드 자체의 문제 아님)
- `npm run test`: 전체 112/112 통과(신규 20건 — HomeView 5건, parental-badges EVENT 케이스 8건 등)
- `npm run build`: 최초 시도에서 `useSearchParams()`를 쓰는 `/nearby`, `/region`가 Next.js의 "Suspense 경계로 감싸야 함" 정적 프리렌더 요구사항에 걸려 실패 → 두 페이지를 `<Suspense>`로 감싸 해결, 이후 정상 통과(`Route (app)` 출력에서 `/`가 `ƒ`(동적)로, 나머지는 `○`(정적)로 확인)
- `npm run dev` 기동 후 `curl`로 `/`, `/nearby`, `/region`, `/calendar`, `/api/home/feed` 전체 HTTP 200 확인, 서버 로그 에러/경고 없음, `/api/home/feed` 실제 DB 데이터 정상 응답, 각 페이지 SSR HTML에 기대 문구 존재 확인(예: "0원의 행복", "카테고리", "내주변", "체험·클래스" 등)

## 특이 사항 / 한계
- **브라우저 실제 확인 미실시**: 이 세션 환경에 Playwright 등 브라우저 자동화 도구가 없어 CLAUDE.md 제5장 제8조가 요구하는 "실제 화면 동작 확인"을 완전한 형태로는 못 했다. HTTP 상태 코드 + SSR HTML 내용 + 서버 로그 기반 확인까지만 완료했고, 클릭 인터랙션/캐러셀 스크롤/이미지 로딩 등은 육안 확인이 필요하다.
- **[찜]/[마이] 비활성 처리**: `spec/common/feature-flags.md` 원칙대로 탭 자체는 5개 고정 노출하되 `FEATURE_FLAGS`(기본 false)로 클릭 불가 처리. 승인/구현 이후 환경변수만 켜면 즉시 활성화된다.
- **[특가·핫딜] 비활성 처리**: 커머스 API(쿠팡 파트너스/네이버 쇼핑) 자체가 미보유라 실제 데이터가 없다 — 가짜 데이터로 채우지 않고 서브탭을 비활성화했다. 데이터 소스가 확보되면 `home-sub-tabs.tsx`의 `enabled: false`만 바꾸면 된다.
