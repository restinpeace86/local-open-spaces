# Task 9-1-1: 홈 위치 기반 30km 필터링 + venue_name 백필 + Hero Carousel Auto-play

## 구현 대상
`implementation/todo.md` [Task 9-1-1]: 유저 위치 기준 반경 30km 이내 당일 행사 큐레이션, `[장소명] · [거리]` 카드 표기 완결성, Hero Carousel 5초 Auto-play

## 구현 일시
2026-08-22

## 지시서 전제와 실제 스키마 불일치 (임의로 무시하지 않고 대체 경로로 처리)
지시서는 "원본 `raw_data` 내 장소명 텍스트를 추출해 백필"을 요구했으나, 실제로는 `events` 테이블에 `raw_data` 컬럼 자체가 없다(`open_spaces`만 보유 — Task 9-1에서 이미 발견한 것과 동일 계열의 스키마 문서-실제 불일치). 저장된 적 없는 컬럼에서 백필할 원본이 없으므로, 대신 다음 경로로 동일한 목표를 달성했다:
1. 어댑터에 venue_name 매핑 추가
2. 각 어댑터를 실제 라이브 API로 재실행 → 기존 external_id와 매칭되는 모든 행이 upsert로 갱신됨(실질적으로 "백필"과 동일한 효과)

## 변경 사항

### 마이그레이션 + 스키마
- `scripts/migrations/2026-08-22-events-add-venue-name.sql`: `ALTER TABLE events ADD COLUMN venue_name TEXT` — 적용 완료
- `npm run gen:types`로 `src/types/database.types.ts` 재생성(신규 컬럼 반영)

### 어댑터 venue_name 매핑 (전부 실측 확인, 추측 없음)
- `scripts/ingest/adapters/lib/schema-mapper.mjs`: `buildEventRow`에 `venueName` 파라미터 추가
- `seoul-yeyak-adapter.mjs`: `venueName: item.PLACENM`
- `seoul-culture-events.mjs`: `venue_name: item.PLACE`
- `tour-api-festival.mjs`: `venue_name: item.addr1`(이 소스는 별도 장소명 필드가 없어 주소로 대체 — 실측 확인)

### 부수 발견 및 수정: tour-api-festival.mjs의 실제 버그 2건
백필을 위해 이 스크립트를 재실행하다가 발견:
1. **이중 URL 인코딩**: `env.TOUR_API_KEY`(이미 인코딩된 값)에 `encodeURIComponent`를 또 적용해 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(HTTP 403) 발생 중이었음. 다른 모든 어댑터와 동일하게 `env.PUBLIC_DATA_API_KEY`(디코딩 키) + 단일 인코딩으로 통일.
2. **잘못된 파라미터**: `arrangeType: 'A'`가 `INVALID_REQUEST_PARAMETER_ERROR(arrangeType)`를 유발. 유효값을 추측하지 않고 파라미터를 제거(기본 정렬로 정상 동작 확인).

### 백필 실행 결과 (세 어댑터 재실행)
| 소스 | 총 건수 | venue_name 채워짐 |
| --- | --- | --- |
| SEOUL_YEYAK | 2,708 | 2,685 |
| TOUR_API | 20 | 20 |
| SEOUL_CULTURE | 18,961 | 18,961 (100%) |
| **events 전체** | **24,233** | **21,666 (89.4%)** |

나머지 ~11%는 재수집 시점에 라이브 API 응답에 더 이상 없는(종료/삭제된) 구 데이터 — 재수집 기반 백필 방식의 자연스러운 한계.

### 위치 기반 반경 30km 필터링
- `src/lib/home/get-home-feed.ts`: `Origin` 타입, `DEFAULT_HOME_ORIGIN`(성남시 분당구) 추가 — 이미 실제 지오코딩된 자사 DB 좌표(분당올림픽스포츠센터, 경기도 성남시 분당구 중앙공원로 35)를 그대로 재사용해 주소를 추측하지 않았다.
- Supabase는 SQL 단에서 Haversine을 계산할 수 없어(신규 PostGIS RPC 없이는), 후보군을 500건까지 가져온 뒤 `haversineDistanceMeters`로 애플리케이션 레벨에서 30km 필터링 + 거리순 정렬.
- `src/app/api/home/feed/route.ts`: `?lat=&lng=` 쿼리파라미터 지원(없으면 기본값)
- `src/components/home/home-view.tsx`: 유저가 `useUserLocation`으로 실제 위치를 설정하면(`addressName` 존재) 그 좌표로 클라이언트에서 재조회

### 카드 UI "[장소명] · [거리]" 통일
- `src/lib/spaces/format.ts`: `formatVenueLine(address, distanceMeters)` 신설
- `NearbyItem.address`에 `venue_name`을 그대로 실어(타입 변경 없이) `EventCard`/`SpaceGridCard`/`HeroCarousel`가 전부 이 필드+함수로 통일 표시
- "장소 정보 없음"/"주소 정보 없음" 플레이스홀더 문구를 코드에서 완전히 제거

### Hero Carousel Auto-play
- `hero-carousel.tsx`: `setInterval(5000ms)`, `scrollIntoView({behavior:'smooth', inline:'start'})`로 다음 아이템 전환. `onMouseEnter`/`onMouseLeave`(호버), `onTouchStart`/`onTouchEnd`(터치)로 일시정지/재개.

## 검증 결과
- `npx tsc --noEmit`: 최초 실행 시 신규 컬럼이 생성 타입에 없어 에러 → `npm run gen:types` 후 통과
- `npm run test`: 전체 126/126 통과
  - 신규: `format.test.ts`(4건), `get-home-feed.test.ts`(2건 — 30km 필터링 실측 좌표 기반 검증, venue_name null 처리), `hero-carousel.test.tsx`(4건 — Auto-play/호버/터치 일시정지), `home-view.test.tsx`에 2건 추가(카드 표기 포맷, 위치 기반 재조회)
- `npm run build`: 통과
- `npm run dev` 실행 후 실제 확인:
  - `/api/home/feed` 응답이 분당 기준 10~12km권 이벤트만 포함, 30km 밖 배제 확인
  - SSR HTML에서 "해찬솔유아숲체험원 · 10.4km" 등 실제 "[장소명] · [거리]" 표기 확인
  - "장소 정보 없음"/"주소 정보 없음" 문구 0건 확인

## 특이 사항
- **`raw_data` 백필 경로 부재**: 지시서 전제(원본 raw_data에서 추출)가 실제 스키마와 맞지 않아 대체 경로(어댑터 재실행)로 우회했다. 이 방식은 라이브 API에 더 이상 없는 구 데이터까지는 커버하지 못한다(89.4% 커버리지).
- **분당 기준 좌표의 근거**: 주소를 geocoding API로 새로 추측하지 않고, 이미 실제로 지오코딩되어 DB에 저장된 분당구 소재 시설 좌표를 그대로 재사용했다(제3장 제5조 추측 금지 준수).
- **tour-api-festival.mjs는 여전히 20건만 수집**: 이 레거시 스크립트는 `numOfRows=20` 하드코딩(페이지네이션 없음)이 남아있다. seoul-culture-events.mjs에서 동일 유형 버그를 Task 8-4에서 고쳤던 것과 같은 패턴이나, 이번 Task 9-1-1 지시 범위(venue_name 매핑)를 넘어서는 별도 개선이라 이번엔 손대지 않았다 — 향후 필요 시 백로그로 남긴다.
