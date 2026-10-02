# 스팟/이벤트 상세 "주변 주차장/식당" 아코디언

## 구현 대상
사용자 지시(2026-10-02): "키즈친화 식당 하고 주변 주차장으로 해서 하나의 스팟/이벤트
장소에 대하여 주변정보로써 제공하려고 해... 스팟픽에서 보여주고 있는 스팟 상세페이지나
이벤트픽 상세페이지에 주변 식당영역이랑 주변 주차장영역으로 보여주고자 해." 뒤이은
구체 스펙: "주말/만차 대비 주변 공영주차장 보기(3곳)" / "주변 키즈 친화 식당 보기(2곳)"
형태의 아코디언, 각 카드는 "이름 (직선 Xm/도보 N분)" + 뱃지 + "길찾기 ↗". 전략:
1) 접힌 상태 — 직선거리 반경(주차장 500m, 식당 1km) DB 조회로 "N곳"만 즉시 표시.
2) 펼친 상태 — 그제서야 도보 길찾기 API(Tmap)로 실거리/시간을 계산.

## 사전 조사(서브에이전트, 코드 변경 없는 순수 조사)
- `/api/nearby/*` 4개 라우트 중 반경검색을 수행하는 건 없음(전부 service_role 프록시).
  실제 반경검색은 `get_nearby_spaces_and_events` RPC(PostGIS `st_dwithin`)가 전담.
- `/api/nearby/directions`는 카카오모빌리티 **자동차** 길찾기 전용 — 보행자 경로 API
  아님, 재사용 불가.
- 스팟픽/이벤트픽 상세는 완전히 별개 페이지가 아니라 `src/components/map/
  detail-modal.tsx`(1390줄) 하나가 `isEvent` 분기로 양쪽을 렌더링하는 공유 모달.
  단, 실제로는 `isEvent ? (...) : (...)` 형태로 거의 전체 JSX가 두 갈래로 분리돼 있어
  신규 섹션은 양쪽에 각각 추가해야 함.
- "키즈친화 식당" 그룹(`spot-category-groups.ts`): `minors: ['놀이방식당', '키즈친화
  식당(오케이존)']` — 기존 `get_nearby_spaces_and_events` RPC가 이미 `p_category_mins`
  배열 필터를 지원해(2026-09-27) 신규 RPC 없이 그대로 재사용 가능.
- open_spaces.location은 `geometry(Point,4326)` — 신규 테이블도 동일 타입 사용.
- 독립 보조 테이블 전례: `homeplus_lecture_list`(서비스롤 전용 RLS 패턴) 그대로 복제.

## 도보 길찾기 API 선정 과정
1. "카카오 길찾기 API 지금 쓰고 있는데 보행자 경로 없어?" → 공식 사이트 직접 확인:
   카카오모빌리티는 "자전거, 도보 길찾기" API를 **제공은 하지만 제휴 문의(B2B 계약)
   전용**, 지금 쓰는 자동차 길찾기처럼 셀프서비스 키 발급이 아님.
2. 사용자가 Tmap(SK) 보행자 경로 API(하루 1,000건 무료)를 직접 확인 후 채택,
   "나중에 가입할게 비워놔" — `TMAP_API_KEY`를 빈 값으로 `.env.local`에 추가하고,
   키가 없는 동안에도 기능이 멈추지 않도록(제5장 제11조 무중단 원칙) 직선거리 +
   평균 보행속도(4km/h) 기반 추정치로 자동 폴백하는 구조로 설계했다.
3. **미검증 사실 고지**: Tmap 보행자 API의 정확한 요청/응답 형식(엔드포인트,
   `totalDistance`/`totalTime` 필드 위치)은 이 세션에서 실제 키로 호출해 검증하지
   못했다(공개 문서 기반 작성, `tmap-walking-client.ts` 상단에 명시). 키 등록 후
   반드시 실제 호출로 확인 필요.

## 데이터 품질 이슈 발견 및 보강 — 서울시 공영주차장
- GetParkInfo API 샘플 조사: 전체 2,189건(구획 포함) → 고유 주차장 850개(노상주차장
  하나가 여러 구획으로 중복 등재되는 구조) → **좌표 보유 117개(13.8%)뿐**이었다.
- 사용자 확인 후 결정: "주소 기반 지오코딩 보강 추가해.. vworld꺼 지오코딩 우리쓰고
  있지않아? 기존에 쓰던거 써봐" — 기존 `vworld-geocoder.mjs`(국토교통부 무료
  공공API, 카카오 폴백 내장, 여러 어댑터가 이미 씀)를 그대로 재사용해 ADDR 기준
  백필. **결과: 좌표 보유율 13.8%→97.8%(831/850)**, 714건 성공 지오코딩.
- **버그 발견/수정**: 동일 PKLT_CD 중복 제거 시 단순 "마지막 값"을 쓰면, 여러 구획
  중 하필 좌표 0.0인 행이 마지막일 때 멀쩡한 좌표를 가진 다른 구획을 버리는 버그가
  있었다(실측: 66.5%→13.8%로 급락). `dedupeByPkltCdPreferringCoords()`로 그룹 내
  좌표 있는 행을 우선하도록 수정.

## 변경 사항
### 1. `scripts/migrations/2026-10-02-nearby-parking-and-restaurant-amenities.sql`(적용 완료)
- `seoul_public_parking_lots`(신규): 공영주차장 테이블. `homeplus_lecture_list`와 동일
  패턴(서비스롤 전용 RLS). `location geometry(Point,4326)` nullable + gist 공간 인덱스.
- `nearby_walking_distance_cache`(신규): (origin_table,origin_id,target_table,target_id)
  유닛크 — Tmap 하루 1,000건 무료 한도를 아끼기 위한 영구 캐시(TTL 없음, 위치가
  거의 안 바뀌는 데이터라 MVP 범위에서는 만료 로직 불필요로 판단).
- `get_nearby_parking_lots(user_lng, user_lat, radius_meters)`(신규 RPC): 기존
  `get_nearby_spaces_and_events`와 동일한 `st_dwithin` 패턴, PUBLIC 기본 권한(클라
  이언트 직접 호출).

### 2. `scripts/ingest/seoul-public-parking.mjs` + 테스트(신규, 15개)
서울시 공영주차장 수집(GetParkInfo, Seoul Open Data). open_spaces가 아니라 전용
테이블이라 BaseCollectorAdapter를 쓰지 않고 완전 별도 스크립트로 작성(homeplus와
동일한 판단). `transform()`, `dedupeByPkltCdPreferringCoords()`,
`backfillMissingCoordsByAddress()`(VWorld 지오코딩 재사용) 3개 핵심 함수 export +
단위 테스트. `pipeline_logs`에 독립적으로 기록(`run-monthly.mjs`의 open_spaces/events
전용 집계 로직에 억지로 편입하지 않음).
- `scripts/ingest/lib/pipeline-agent-registry.mjs`: `SEOUL_PUBLIC_PARKING` 등록.
- `.github/workflows/ingest-monthly.yml`: 기존 월간 배치 뒤에 독립 스텝으로 추가
  (같은 "말일에만 실행" 가드 공유).
- `package.json`: `ingest:seoul-public-parking` 스크립트 추가.

### 3. 도보거리 계산
- `src/lib/nearby/tmap-walking-client.ts`(신규): Tmap 호출(미검증, 위 고지 참고).
- `src/lib/spaces/walking-distance-estimate.ts`(신규, 테스트 4개): Haversine 직선거리
  + 보행속도 기반 소요시간 추정.
- `src/app/api/nearby/walking-distance/route.ts`(신규, 테스트 6개): POST, 배치(최대
  20건) 처리. 캐시 조회 → 미스만 Tmap 호출(키 없으면 즉시 추정 폴백, 호출 실패해도
  추정 폴백) → 신규 계산분만 캐시 upsert. 추정치는 캐시하지 않음(키 등록 후 바로
  실측값으로 교체되도록).

### 4. 클라이언트 조회
- `src/lib/spaces/get-nearby.ts`: `getNearbyKidsRestaurants()`(기존
  `get_nearby_spaces_and_events` RPC 재사용, category_min 그룹은 spot-category-
  groups.ts를 단일 출처로 참조), `getNearbyParkingLots()`(신규 RPC 호출). 테스트 4개
  추가.

### 5. UI — `src/components/map/nearby-amenities-section.tsx`(신규, 테스트 3개)
`ParkingAccordion`/`RestaurantAccordion` 2개 + 공유 `AccordionShell`. 마운트 시
직선거리 후보만 조회(0건이면 아코디언 자체를 숨김), 펼칠 때만
`/api/nearby/walking-distance`를 배치 호출해 실거리/시간으로 교체 표시(표시된 적
있으면 재조회 안 함). 식당 카드는 기존 `/api/nearby/spot-badges` 라우트를 그대로
재사용해 뱃지(예: "놀이방 완비") 노출. "길찾기 ↗"는 카카오맵 앱/웹으로 연결(Tmap
연동 전까지는 인앱 정확한 경로선을 그릴 방법이 없어, 기존 "외부 앱으로 안 내보낸다"
원칙의 예외로 둠 — 이 카드 자체가 "거기로 가는 길" 안내가 목적이라 자연스러움).
`src/components/map/detail-modal.tsx`: EVENT/SPACE 두 분기 각각에 미니맵 블록
바로 아래(`hasExactLocation`일 때만) 삽입.

## 검증
- `npx vitest run`(관련 신규 테스트 파일 전부): 33개 신규 테스트 통과(ingest 15,
  get-nearby 4, walking-distance-estimate 4, walking-distance route 6, nearby-
  amenities-section 3, 기존 get-nearby.test.ts 포함).
- **실측 회귀 발견/수정**: `map-explorer.test.tsx`의 "다른 예약 옵션" 그룹멤버 테스트가
  깨짐 — 신규 섹션이 상세 모달 마운트 시 RPC를 2건 추가로 호출하는데, 이 테스트의
  `rpcMock`이 호출 **순서**로만 큐를 소비하는 구조라 새 호출이 `get_spot_group_
  members`용으로 준비된 응답을 가로챘다(실측: 그룹 멤버 목록이 빈 배열로 렌더링돼
  "B타입" 텍스트가 안 보임). 해당 테스트에 빈 응답 2개를 올바른 위치에 끼워 넣어
  수정 — 더 넓은 범위의 mock 아키텍처 리팩토링(27개 호출부 영향)은 이번 범위를
  넘어서 하지 않음.
- `npx tsc --noEmit` / `npm run test`(252개 파일, 2,659개 테스트) / `npm run build`
  전부 통과.
- `seoul-public-parking.mjs` 실제 실행: 850개 고유 주차장, 지오코딩 백필 후 831개
  좌표 보유, Supabase 업서트 성공.
- `get_nearby_parking_lots` RPC 실측 호출(구로디지털단지역 좌표 기준): 1km 내 11건
  정상 반환, 거리순 정렬 확인.

## 후속 — 도보거리 계산 보류(2026-10-02)
사용자 지시: "지금은 직선거리 기반 직경거리로 해. 그리고 가까운순서대로 보여주고..
그리고 처음에 default는 접힌상태야 사용자가 펼치기 누르면 펼치는거야. 그게
낫겠지?"
- **도보거리 API 호출 제거**: `NearbyAmenitiesSection`이 펼칠 때 `/api/nearby/
  walking-distance`를 호출해 도보 실거리로 교체 표시하던 로직을 걷어내고, 지금은
  항상 직선거리만 보여준다. 해당 API 라우트/Tmap 클라이언트/캐시 테이블은 삭제하지
  않고 그대로 남겨둠(Tmap 키 등록 후 이 컴포넌트에서 다시 호출하도록 되돌리면 됨).
- **정렬**: 이미 해결돼 있었다 — `get_nearby_parking_lots`/`get_nearby_spaces_and_
  events` 둘 다 SQL에서 `order by distance_meters`로 정렬해 반환하므로 추가 작업
  불필요(확인만 하고 코드 변경 없음).
- **기본 접힘 상태**: 이미 `useState(false)`로 구현돼 있었다 — 변경 없음(사용자
  확인 요청에 대한 재확인).
- `src/components/map/nearby-amenities-section.tsx`: `walking`/`isLoadingWalking`
  상태, `fetchWalkingDistances()` 호출 제거. 카드는 `lot.distance_meters`/
  `spot.distance_meters`(직선거리)만 표시.
- `src/components/map/nearby-amenities-section.test.tsx`: 도보거리 관련 테스트를
  "직선거리만 표시" 테스트로 교체 + 토글 재클릭 시 접히는 테스트 추가(4개로 재구성).

### 검증
- `npx vitest run nearby-amenities-section.test.tsx` 4개 통과.
- `npx tsc --noEmit` / `npm run test`(252개 파일 2,660개) / `npm run build` 전부 통과.

## 후속 — 길찾기 출발지/이동수단 버그 수정(2026-10-02)
사용자 실측 버그 리포트: "2026 인사동 엔틱&아트페어 이벤트... 정성순대 울산옥동점이
직선 927m인데... 길찾기하면 카카오네비로 넘어오고 출발지가 현재위치기준으로
잡혀있네... 지금 현재위치기준이 아니고 우리가 가는 이벤트 스팟.. 목적지가 출발지가
되어야하고 그 주변식당이 도착지가 되어야하지. 그리고... default가 차로 되어있는데
도보 선택해줄수있어?"

### 원인
기존 `DirectionsLink`가 쓰던 `https://map.kakao.com/link/to/{name},{lat},{lng}`는
목적지만 지정하는 형식이라, 카카오맵/내비 앱이 항상 사용자의 실시간 GPS 위치를
출발지로 자동 적용한다 — 출발지를 지정할 방법 자체가 없는 URL 스킴이었다.

### 조사
카카오맵 공식 URL 스킴 문서(apis.map.kakao.com/web/guide)를 WebFetch로 직접
확인(추측 금지) — 출발지·도착지·이동수단을 모두 지정하는 전용 형식 확인:
`https://map.kakao.com/link/by/{car|walk|bicycle|traffic}/{출발지명},{위도},{경도}/
{도착지명},{위도},{경도}`(첫 좌표가 출발지, 마지막이 도착지, 중간은 경유지).

### 수정 — `src/components/map/nearby-amenities-section.tsx`
- `OriginInfo`에 `name: string` 추가(링크의 출발지 라벨용).
- `DirectionsLink`를 `{lat,lng,name}` 단일 지점 대신 `{origin, destination}` 두
  지점을 받도록 변경, `/link/by/walk/...` 형식으로 출발지=현재 스팟/이벤트,
  도착지=주차장/식당, 이동수단=도보를 전부 명시.
- `ParkingCard`/`RestaurantCard`가 `origin`을 받아 `DirectionsLink`에 전달하도록 수정.
- `src/components/map/detail-modal.tsx`: `NearbyAmenitiesSection` 호출 2곳(EVENT/
  SPACE 분기)에 `name={item.name}` prop 추가.
- 테스트: 길찾기 링크의 `href`가 올바른 출발지/도착지/도보 모드로 생성되는지
  검증하는 테스트 신규 추가(5개로 재구성).

### 검증
- `npx vitest run nearby-amenities-section.test.tsx` 5개 통과(신규 링크 검증 포함).
- `npx tsc --noEmit` / `npm run test`(252개 파일 2,661개) / `npm run build` 전부 통과.

## 후속 — 공개 읽기 RLS 누락 + 펼침 스크롤 포커스 버그(2026-10-02)
사용자 실측 리포트: "인사동 엔틱&아트페어 아직 안보이는데? 새로고침했는데? 그 주변
키즈친화식당만 보이고... 그리고 주변 키즈친화 식당 관련해서 펼치기 했을때 포커스가
이게 아닌거 같아.. 9곳펼쳐도 아래쪽으로 열리고 이걸 밑에서부터 끌어올려야돼"

### 버그 1 — 공영주차장이 전혀 안 보임(RLS)
서비스롤 키로 직접 조회하면 해당 이벤트(37.5739/126.9856) 반경 500m 내 주차장이
실제로 2곳(서인사마당, 탑골공원 관광버스전용 주차장) 있었는데, 화면에는 전혀
노출되지 않았다. **익명(anon) 키로 동일 RPC를 직접 호출해 재현** — 에러 없이
`200 []`(빈 배열)만 반환됨을 확인. 원인: `seoul_public_parking_lots`를 만들 때
`homeplus_lecture_list`(관리자 전용 내부 데이터) RLS 패턴을 그대로 복사해
service_role 전용 정책만 뒀다 — 하지만 이 테이블은 상세 모달에서 anon 사용자가
직접 읽어야 하는 **공개** 데이터다. `pg_policies`를 직접 조회해 비교해보니
open_spaces/events는 애초에 RLS 자체가 없는 구조였다(정책 0건). 이 테이블은 RLS는
유지하되(쓰기는 service_role만 — 더 안전한 설계) 읽기 전용 공개 정책을 추가:
`scripts/migrations/2026-10-02-fix-seoul-public-parking-lots-public-read.sql`
(`for select to anon, authenticated using (true)`, 적용 완료). 적용 후 anon
키로 재조회해 2건 정상 반환 확인.

### 버그 2 — 펼쳤을 때 화면이 자동으로 안 내려감
`src/components/map/nearby-amenities-section.tsx`의 `AccordionShell`에 펼칠 때
토글 버튼을 스크롤 가능한 조상(상세 모달의 overflow-y-auto 영역) 기준 상단으로
자동 스크롤하는 `useEffect`(`containerRef.current?.scrollIntoView({ behavior:
'smooth', block: 'start' })`) 추가. jsdom이 `scrollIntoView`를 구현하지 않아
테스트가 깨져, `vitest.setup.ts`에 전역 no-op 폴리필 추가(이 메서드를 쓰는 다른
컴포넌트에도 공통으로 적용되는 일반적인 수정).

### 검증
- `npx vitest run nearby-amenities-section.test.tsx` 5개 통과.
- `npx tsc --noEmit` / `npm run test`(252개 파일 2,661개) / `npm run build` 전부 통과.
- anon 키로 `get_nearby_parking_lots` RPC 재조회 — RLS 수정 전 `[]`, 수정 후
  2건 정상 반환 확인(실측 전/후 대조).

## 특이 사항 / 남은 작업
- **Tmap 키 미등록 상태** — 사용자가 추후 가입 예정("나중에 가입할게"). 그 전까지는
  모든 도보거리가 직선거리 기반 추정치(`isEstimate:true`)로 표시된다. 키 등록 후:
  1) `.env.local`/Vercel/GitHub Secrets에 `TMAP_API_KEY` 설정, 2) 실제 호출 1회로
  `tmap-walking-client.ts`의 응답 파싱 로직(미검증 — 위 고지)이 맞는지 확인 필요.
- 공영주차장 19개(850건 중)는 지오코딩 백필도 실패해 좌표 없이 남아있다 — 이
  아코디언에는 노출되지 않는다(반경 RPC가 `location is not null` 조건으로 자동 제외).
- 식당 측 뱃지는 `spot_curations`에 큐레이션 데이터가 있는 스팟만 표시된다(없으면
  뱃지 줄 자체가 안 보임 — 기존 `/api/nearby/spot-badges` 동작 그대로).
