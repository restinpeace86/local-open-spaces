# [프론트엔드 UI/UX 개선] 이벤트픽/스팟픽 메인 화면 개편 (docs/spec.md 개정판 기준)

## 구현 대상
- docs/spec.md의 "[개정] 이벤트픽 메인 페이지 사양" / "[개정] 스팟픽 메인 및 지도 사양" 섹션을
  기준으로 이벤트픽(`/`)·스팟픽(`/nearby`) 메인 화면을 개편
- GNB 헤더/검색 타겟 분리, Hero 카드 위치기반 정렬, 당일 예약 슬라이더 신규, 스팟픽 지도
  단일 레이아웃 전환(탭/반경 버튼 제거)

## 구현 일시
2026-08-26

## 변경 사항

### 1. 스팟픽(`/nearby`)
- `src/app/(explore)/nearby/page.tsx` → `src/app/nearby/page.tsx`로 이동(라우트 그룹에서
  분리). `(explore)` 그룹에는 `/region`(도감)·`/calendar`(캘린더) 2개만 남는다.
- `TopTabs`(`src/components/nav/top-tabs.tsx`)에서 '지도' 탭 제거 — 남은 두 라우트끼리만
  탭으로 오가고, 스팟픽은 이 그룹 밖에서 헤더+지도만으로 단일 레이아웃을 이룬다(Decision 008
  "기존 뷰는 폐기가 아니라 재배치" 원칙 유지 — /region, /calendar는 삭제하지 않음).
- `MapExplorer`(`src/components/map/map-explorer.tsx`)에서 `RadiusSelector`/`GridViewPrompt`
  사용을 완전히 제거하고, 반경을 고정값(`FIXED_RADIUS_METERS = 5000`, 기존 기본값 그대로 승계)
  으로 바꿨다. 두 컴포넌트 파일 자체도 다른 사용처가 없어 삭제했다.
- `LocationHeader`가 상세 도로명주소(`addressName`) 대신 시/군/구(`sigunguName ?? addressName`)
  를 표기하도록 수정 — 이벤트픽(`HomeHeader`)과 동일한 표기 방식으로 통일했다.

### 2. 이벤트픽(`/`, `HomeView`)
- **GNB 검색 이벤트 전용화**: `HomeHeader`가 `/nearby?q=...`로 이동시키던 기존 동작을 제거하고,
  검색어를 부모(`HomeView`)로 올려보내는 제어 컴포넌트로 전환. `src/lib/home/get-home-feed.ts`에
  `searchEvents()` 신규 추가(지역 제한 없이 `events.title` ILIKE 검색), `/api/home/search`
  라우트 신규. 검색어가 있으면 서브탭 콘텐츠 대신 인라인 검색 결과 그리드를 보여준다(라우팅
  이동 없음, 기존 카테고리 인라인 피딩과 동일한 패턴).
- **Hero 카드 경기/서울 우선순위**: `get-home-feed.ts`에 `heroRegionTier()`/`provinceOf()` 추가.
  기존 `regionTier`의 0/1순위(정확 일치/상위 시 일치)는 그대로 최우선 유지하고, 2순위("그 외
  수도권") 안에서만 사용자 자신이 속한 도(경기/서울)를 한 번 더 앞으로 당긴다.
  `selectRegionFirst()`에 tier 함수를 주입할 수 있게 해(기본값은 기존 `regionTier` 그대로) 다른
  호출부(`getCategoryFeed` 등)는 영향이 없다 — `getTodayEvents`만 `heroRegionTier`를 넘긴다.
- **당일 예약 필요 카드 슬라이더(신규)**: `getReservationOpenEvents()` 추가 —
  `booking_status='접수중'`(SEOUL_CULTURE_EVENTS/TOUR_API_FESTIVAL/GG_CULTURE_EVENTS 3개 소스)
  OR (`source='seoul_public_reservation'` AND `raw_data->>SVCSTATNM='접수중'`)(SEOUL_YEYAK
  전용 — 이 소스는 booking_status 컬럼을 채우지 않고 원본 SVCSTATNM만 raw_data에 보존함,
  seoul-yeyak-adapter.mjs 실측 확인) 두 조건을 각각 쿼리해 병합·중복 제거한다. 신규 컴포넌트
  `ReservationOpenSlider`(가로 스크롤, `EventCard` 재사용)를 Hero 카드 바로 아래에 배치.
  `getHomeFeed()`/`page.tsx`(SSR 초기 페칭)/`/api/home/feed`(재조회) 모두에 연결했다.

## 검증
- `npx tsc --noEmit`: clean(빌드 캐시에 남아있던 구 라우트 경로 참조는 `.next` 삭제 후 재확인
  해 해소).
- `npm run test`: 37 파일 400건 통과(신규 6건: Hero 경기/서울 우선순위 2건, 당일예약 슬라이더
  3건, 이벤트 검색 1건 — 기존 394건 회귀 없음).
- `npm run build`: 성공. 라우트 목록에서 `/nearby`가 `/region`·`/calendar`와 같은 레벨의
  독립 라우트로 나옴을 확인(라우트 그룹 분리 반영 확인).
- 실제 화면 확인(`npm run dev` + curl로 렌더링된 HTML 검사, 이후 서버 종료):
  - `/nearby`: `1km`/`5km`/`10km` 텍스트 없음(반경 버튼 삭제 확인), `지도`/`도감`/`캘린더`
    탭 텍스트 없음(단일 레이아웃 확인), 카테고리 칩("공원·광장" 등)은 정상 노출.
  - `/region`: `도감`/`캘린더` 탭은 그대로 남아있음(스팟픽만 분리됐음을 확인).
  - `/`(홈): "당일 예약 필요" 섹션이 실제 카드와 함께 렌더링됨(실 DB 데이터로 쿼리 동작 확인),
    검색창 placeholder 정상 노출, `/nearby?q=` 문자열이 더 이상 응답에 남아있지 않음(검색
    리다이렉트 제거 확인).

## 특이 사항 — 스킵(보류)한 항목

지시사항 4항 "카테고리 구역: 원천 중분류(`MINCLASSNM`) 전체 노출"은 이벤트픽/스팟픽 양쪽 모두
구현하지 않고 스킵했다. 이유(실측 확인, 추측 아님):

- `scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql`에 이미 명시돼 있듯, `MINCLASSNM`은
  서울시 공공예약 API(SEOUL_YEYAK, `source='seoul_public_reservation'`) 원본 응답에만 있는
  필드다. `open_spaces` 13개 소스 중 12개, `events` 4개 소스 중 3개는 raw_data에 이 키 자체가
  없다.
- 지시를 문자 그대로 구현하면(예: `raw_data->>'MINCLASSNM'` 값으로 필터 버튼을 만들면) 전체
  18만여 건 중 SEOUL_YEYAK 소스분을 제외한 절대다수 행은 어느 카테고리에도 속하지 못해
  카테고리 필터/마커 기능이 사실상 텅 비게 된다.
- 이는 제3장 제5조(추측 금지)·제7장 제3조(임의 비즈니스 로직 생성 금지)에 해당하는 진짜
  데이터 모델 충돌이라, 대체 taxonomy(예: 다른 소스는 `source_type`/기존 5대 카테고리로
  대신하는 하이브리드)를 임의로 만들지 않고 대표 확인 대기로 남겼다. 기존 5대 UI 카테고리
  그리드(이벤트픽)와 테마별 필터(스팟픽, `NEARBY_CATEGORY_FILTER_OPTIONS`)는 그대로 유지돼
  있어 카테고리 필터/마커 기능 자체의 공백은 없다.
- `implementation/todo.md`에 스킵 사유와 재개를 위한 선행 조건(MINCLASSNM 적용 범위를 어떻게
  정할지에 대한 대표 결정)을 기록해 뒀다.
