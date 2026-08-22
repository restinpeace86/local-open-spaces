# Task 9-1-3: 실시간 거리 계산 제거·DB 인덱싱, 피드 중복 제거·행정구역 우선 정렬, 모바일 카드 UX

## 구현 대상
`implementation/todo.md` [Task 9-1-3]: 홈 피드 속도 최적화(Haversine 제거 + 인덱싱), 피드 중복 제거(무료 뱃지 병합), 행정구역 우선 정렬, 모바일 Hero Carousel UX 개선, 위치 변경 즉시 동기화

## 구현 일시
2026-08-22

## 변경 사항

### 1) DB sigungu_name 컬럼 + 인덱스
- `scripts/migrations/2026-08-22-sigungu-name-and-indexes.sql`: `open_spaces`/`events`에 `sigungu_name TEXT` 추가, `is_free`/`category`(open_spaces)·`is_free`/`event_type`(events)·양쪽 `sigungu_name`에 인덱스.
- `scripts/ingest/adapters/lib/schema-mapper.mjs`: `extractSigunguName(address)` 신설(한국 주소 "{시/도} {시/군/구} {상세}" 구조 판별, 시 아래 구가 또 있는 2단 구조 "성남시 분당구"도 정확히 결합). `buildOpenSpaceRow`는 address에서 자동 계산, `buildEventRow`는 명시적 파라미터로 받음.
- 이벤트 3개 소스 실측 필드 매핑: `seoul-culture-events.mjs`→`GUNAME`, `seoul-yeyak-adapter.mjs`→`AREANM`, `tour-api-festival.mjs`→`addr1`을 `extractSigunguName`으로 파싱.
- 백필: `open_spaces`는 `scripts/migrations/2026-08-22-backfill-open-spaces-sigungu-name.sql`로 이미 저장된 address에서 DB 단 일괄 계산(API 재호출 없음, 26,346건 중 26,169건 값 채움). `events`는 GUNAME/AREANM이 신규 매핑이라 재수집 필요 — TOUR_API(20건)/SEOUL_YEYAK(2,674건)/SEOUL_CULTURE(18,961건) 3개 어댑터 재실행, 결과 `events` 전체 24,253건 중 21,473건(88.6%)에 sigungu_name 반영(나머지는 재수집 시점에 없던 종료 항목, Task 9-1-1 venue_name과 동일한 자연스러운 한계).

### 2) get-home-feed.ts 전면 재작성 (Haversine 제거)
- `haversineDistanceMeters`/`Origin`/`RADIUS_METERS`/`withinRadius`/`byDistance` 전부 삭제. `distance_meters`는 -1 고정(계산 안 함).
- `HomeRegion { sigunguName }` 개념 도입, `DEFAULT_HOME_REGION`은 기존 기본 좌표(성남시 분당구)의 지역명 계승.
- `dedupeAndMergeFree()`: (이름 정규화 + sigungu_name) 키로 중복 판별, 하나라도 무료면 병합 결과를 무료로 승격.
- `byRegionPriority(region)`: 선택 지역 일치 항목을 0순위로 안정 정렬(다른 지역 제외 안 함, 순위만 재배치).

### 3) API/화면 연동
- `/api/home/feed`: `?lat=&lng=` → `?address=<주소명>`으로 전환, 서버가 `extractSigunguName`으로 지역 추출.
- `src/lib/spaces/extract-district.ts`: `extractSigunguName` 신설(괄호 안 주소 우선 파싱 지원 — 키워드 검색 결과의 "장소명 (주소)" 형태 대응).
- `formatVenueLine(address, sigunguName, distanceMeters?)`: "[장소명] · [시/군/구]" 통일 표기, sigunguName 없을 때만 거리로 대체(지역 도감 페이지 하위호환).
- `EventCard`/`HeroCarousel`/`SpaceGridCard`, `HomeView`(주소 기반 즉시 재조회) 갱신.
- `HeroCarousel`: 카드 폭 `w-[78%] sm:w-72` → `w-full sm:w-72`(모바일 1장 꽉 채움).

## 검증 결과
- `npx tsc --noEmit`: 통과(gen:types 재실행 후)
- `npm run test`: 전체 134/134 통과
- `npm run build`: 통과
- `npm run dev` 실측: 기본 응답 상위 항목 전부 성남시 분당구 확인, `?address=서울특별시 강남구` 재조회 시 강남구 최상단 재정렬 확인, SSR HTML "[장소명] · [시/군/구]" 표기 확인, Hero Carousel `w-full sm:w-72` class 확인, 서버 로그 에러 없음.

## 특이 사항
- `formatVenueLine`의 distanceMeters 인자는 `/region` 페이지(`get_nearby` RPC 기반이라 sigungu_name 없음) 하위호환용으로만 남겨둠 — 홈 피드 컴포넌트는 쓰지 않음.
- `get_nearby_spaces_and_events` RPC/`getAllOpenSpaces`에 sigungu_name을 노출하는 것은 이번 지시서 범위(get-home-feed.ts·모바일 홈 UX) 밖이라 손대지 않음(CLAUDE.md 제7장 제4조).
