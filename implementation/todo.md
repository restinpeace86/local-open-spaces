
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---
- [x] **[Task 9-1-4] 수집 파이프라인 당일 이벤트 전수(100%) 수집 보완 및 전역 위치/카테고리 UX 개편** 완료 (2026-08-22)
  - **핵심 원칙**: 수집 레이어의 모든 제한(건수/지역 제한) 완전 해제 ➔ 당일 및 향후 이벤트 전수 DB 적재 후 유저 기준 큐레이션
  - **세부 작업 지시**:
    1. **TourAPI 및 공공 API 어댑터 전수 수집 (누락 Zero화)**:
       - `tour-api-festival.mjs` 등 모든 수집 어댑터의 20건 제한을 제거하고, 전체 페이지네이션(루프)을 구현하여 당일 진행되는 전국/전지역 축제·행사·체험 데이터 수백~수천 건을 제한 없이 DB에 100% 전수 수집 및 적재.
       - DB 내 `open_spaces`(경기도 시설 1,199건 포함) 및 `events` 전수 데이터를 `get-home-feed.ts` 피드 쿼리에 통합.
    2. **카테고리 탭 2단계 탐색 UX 구현**:
       - `[🏷️ 카테고리]` 탭 클릭 시 5대 카테고리("🎨 체험·클래스", "🌳 야외·자연", "🏛️ 전시·박물관", "🎪 공연·축제", "🎡 키즈·액티비티") 그리드 화면을 먼저 출력.
       - 선택 시 전역 고정 위치 기준으로 해당 카테고리 당일 이벤트 리스트 2단계 노출.
    3. **앱 전역 위치 고정 (쿠키/전역 상태)**:
       - 헤더에서 설정한 위치(예: 성남시 분당구)를 전역 고정하여 `📍 내주변`, `🏷️ 카테고리` 등 타 탭 이동 시에도 해당 위치 기준으로 1순위 정렬.
    4. **5대 카테고리 통일 & 4대 뱃지 풀 노출**:
       - 레거시 카테고리 표기 완벽 제거 후 5대 카테고리로 통일.
       - 모든 카드 UI에 4대 뱃지(가성비, 실내외, 아이동반, 방문시점) 생략 없이 선명히 노출.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - TourAPI 및 수집 파이프라인 전수 재실행 후 DB 내 당일 진행 이벤트 누락 없이 대량 적재 확인.

  ---

  ## [구현 결과 보고]

  ### 1. 수집 파이프라인 전수 수집 (누락 Zero화)
  - **실측 확인(추측 없음)**: 모든 수집 어댑터(`scripts/ingest/*.mjs`, `scripts/ingest/adapters/*.mjs`)를 전수 검토한 결과, 페이지네이션 루프가 없는 곳은 `tour-api-festival.mjs` 단 하나였다(나머지는 city-park/amusement-park/cultural-facility-summary/gg-events/go-camping/national-park-ecotour/playground/public-facility-open/seoul-yeyak/swimming-pool/cultural-spaces/seoul-culture-events/kor-tour 계열 전부 이미 `while` 루프로 전량 수집 중이었음).
  - `tour-api-festival.mjs`: `fetchFestivals({numOfRows:20})` 단발 호출 → `fetchAllFestivals()`(다른 어댑터와 동일한 `while ((pageNo-1)*PAGE_SIZE < totalCount)` 패턴) 전면 재작성. 실측 확인한 실제 `totalCount`(244건, `eventStartDate=오늘` 기준)까지 전량 수집하도록 수정하고 실제로 재실행해 20건 → 244건으로 DB에 반영 완료.
  - **`open_spaces`(경기도 GG_EVENTS 1,199건 포함) 및 `events` 전수 데이터를 `get-home-feed.ts`에 통합**하는 과정에서 **실측으로 심각한 버그를 발견**: `getFreeFeed`/`getTodayEvents`가 "최신순 500건"만 후보군으로 뽑던 기존 방식(Task 9-1-3)은, 한 소스가 다른 소스보다 압도적으로 최근에 대량 수집되면(실측: GG_EVENTS 1,199건이 가장 최근에 수집돼 `is_free=true` 후보 500건 전체를 GG_EVENTS 혼자 차지) **다른 지역 데이터가 후보군에서 통째로 밀려나는 문제**가 있었다(성남시 분당구로 요청해도 응답이 전부 오산시 등 GG_EVENTS 소속 지역이었음, 실측 확인).
    - **수정**: `get-home-feed.ts`에 `fetchRegionFirstRows()` 신설 — 인덱싱된 `sigungu_name` 컬럼으로 **선택 지역을 SQL 단에서 먼저 조회**해(해당 지역 데이터가 얼마든 있든 우선 확보) 후보군에서 밀려나지 않게 하고, 실제 필요한 개수(`limit`)에 못 미칠 때만 지역 제한 없는 2차 조회로 채운다. `getTodayEvents`, `getFreeFeed`의 `open_spaces`/`events` 조회, `getUpcomingDeadlineFill` 전부에 동일하게 적용.
    - 실측 재검증: `?sigungu=성남시 분당구`로 무료 피드 12건 요청 시 12건 전부 성남시 분당구로 정상 노출됨을 확인(수정 전에는 크게 다른 지역 데이터로 오염됐을 상황).
    - `get-home-feed.test.ts` 신규 회귀 테스트 1건: 다른 지역 500건(GG_EVENTS류 재현)이 더 최신이어도 선택 지역 데이터가 밀려나지 않음을 검증.

  ### 2. 카테고리 탭 2단계 탐색 UX 구현
  - `region-grid-view.tsx` 전면 재구성: `category` 상태가 `null`(URL에 `?category=` 없이 진입)이면 **1단계 — `CategoryPickerScreen`**(5대 카테고리 타일 그리드, 홈 Quick 그리드와 동일한 이미지 자산 재사용)만 보여주고 리스트는 아예 렌더링하지 않는다. 타일 클릭 또는 `?category=` 딥링크로 카테고리가 정해지면 **2단계 — 필터링된 리스트 화면**으로 전환되며, "← 다른 카테고리" 버튼으로 1단계로 복귀 가능.
  - `region-grid-view.test.tsx` 전면 재작성(5건): 카테고리 미지정 시 1단계만 노출, 타일 클릭 시 2단계 전환, `?category=` 딥링크 시 1단계 스킵, 뒤로가기 동작, 전역 위치 우선 정렬.

  ### 3. 앱 전역 위치 고정 (쿠키/전역 상태)
  - **실측 확인**: `useUserLocation()`(LocalStorage 기반)이 이미 홈/`/nearby` 양쪽에서 공유돼 "전역 고정"은 이미 동작 중이었다(다른 저장 방식으로 바꿀 필요 없음 — 제5장 제4조 기존 구조 우선). 실제 공백은 **`/region`(카테고리 탭)이 이 전역 위치를 전혀 참조하지 않고 있던 것**이었다.
  - `region-grid-view.tsx`가 `useUserLocation()`의 `sigunguName`을 받아, 2단계 리스트를 **선택 지역 데이터 우선 정렬**(제외하지 않음 — Task 9-1-3의 `byRegionPriority`와 동일 철학)로 보여주도록 추가했다. `get-all-spaces.ts`에 `sigungu_name` 필드를 추가해 이 정렬이 가능하게 했다.

  ### 4. 5대 카테고리 통일 & 4대 뱃지 풀 노출
  - **실측 확인(추측 없음, spec/data/ai-rule.md 3.3 Decision 008 공식 매핑표 활용)**: `events.event_type`/`open_spaces.category` 전수 조회 결과 레거시 값이 대량 잔존— `events`는 EXHIBITION(3,149)/FESTIVAL(1,000)/PERFORMANCE(6,216)/POPUP(6,266)/RESERVATION(2,544) = 전체의 79%, `open_spaces`는 PARK(300)/CULTURE(1,075). ai-rule.md 3.3의 "제안됨(코드 미반영)" 상태였던 공식 매핑표(🌳야외자연←PARK, 🏛️전시박물관←CULTURE·EXHIBITION, 🎪공연축제←FESTIVAL·PERFORMANCE, 🎡키즈액티비티←SPORTS·POPUP·RESERVATION)를 실제 코드에 반영했다.
    - **소스 수정**: `category-map.mjs`(SEOUL_CODENAME_MAP, `classifyTourApiFestival`), `ai-tagging.mjs`(Gemini 분류 프롬프트 `EVENT_TYPES`), `cultural-spaces.mjs`(하드코딩된 `category: 'CULTURE'` → `'EXHIBITION_MUSEUM'`) — 앞으로의 모든 수집은 5대 UI 카테고리를 직접 만들어낸다.
    - **기존 데이터 백필**: `scripts/migrations/2026-08-22-backfill-ui-categories.sql`로 위 매핑표 그대로 일괄 UPDATE. `RESERVATION`(2,544건)은 `SEOUL_RESERVATION` 접두사로 현재 활성 어댑터가 전혀 없는 폐기 소스의 잔존 데이터라 재수집이 불가능해 이 백필이 유일한 정정 경로였음을 실측으로 확인.
    - **프론트엔드 정리**: `category-meta.ts`에서 레거시 8종 `CATEGORY_META` 엔트리 및 `CATEGORY_FILTER_OPTIONS`/`SPACE_CATEGORY_FILTER_OPTIONS`(둘 다 완전 미사용 확인 후) 제거. `category-filter.tsx` 기본값을 `UI_CATEGORY_FILTER_OPTIONS`로 전환 — `/nearby`(MapExplorer, 옵션 미지정으로 기본값 사용 중이었음)의 카테고리 칩에서도 레거시 8종이 사라짐.
    - 백필 후 재검증: `events`/`open_spaces` 전수 조회 결과 5대 UI 카테고리(+ETC) 외 값 0건 확인.
  - **4대 뱃지 풀 노출**:
    - **실측으로 발견한 버그**: `getSpaceBadges`가 `[가성비, 주차, 아이동반, 유모차, 실내외]` 순으로 배열을 쌓은 뒤 `.slice(0,4)`를 적용해, 주차+유모차 정보까지 모두 있는 공간은 4대 핵심 뱃지 중 하나인 **"실내외"(facility_type)가 화면에서 아예 사라지는** 회귀 버그였다. 핵심 3종(가성비/실내외/아이동반)을 먼저 채우고 주차·유모차는 남는 자리에만 추가하도록 우선순위를 재배치해 수정. `parental-badges.test.ts`에 회귀 테스트 추가.
    - **`HeroCarousel`에 4대 뱃지 중 2종(실내외/아이동반)이 아예 없던 것을 발견·보완**: 가성비·방문시점은 기존 썸네일 오버레이(무료/오늘당일·D-DAY)로 이미 노출되므로 중복 없이, `getParentalBadges`에서 `facility_type`/`kids` 항목만 뽑아 카드 본문에 보완 노출.
    - `EventCard`/`SpaceGridCard`는 실측 확인 결과 이미 `getParentalBadges` 전체를 `.map()`으로 그대로 렌더링하고 있어(자체 추가 절단 없음) 수정 불필요.

  ### 검증
  - `npx tsc --noEmit` / `npm run test`(전체 163/163, 신규 다수 포함) / `npm run build`: 모두 통과.
  - `npm run dev` 기동 후 실측: `/region` 무카테고리 진입 시 1단계 선택 화면만 노출, `?category=` 진입 시 2단계 직행 확인. `/nearby` 카테고리 칩에서 레거시 표기 사라짐 확인. 홈 화면 HTML에서 "실내"/"야외"/"복합" 뱃지 렌더링 확인. `?sigungu=성남시 분당구` 무료 피드 12건 전부 분당구로 확인(크로우딩 버그 수정 재검증).

  ### [기존 기능명세서 충돌 및 스킵 로그]
  - 없음 — 모든 세부 지시를 그대로 구현했다.

- [x] **[사용자 지시 후속] "1(전수 수집) 관련" 전체 어댑터 일반 정책 점검 — 최초 전체 적재 완료** 완료 (2026-08-22)
  - **작업 배경**: Task 9-1-4 완료 보고 후 사용자가 "초기엔 전체 데이터를 다 가져오고, 이후엔 변경일자 지원되는 소스만 변경일자 기반으로 업데이트한다는 정책이었다 — 일단 데이터부터 다 가져와야 한다"고 재확인. 어느 소스를 특정하지 않아 **전체 어댑터 일반 정책 점검**으로 범위를 잡고 실측 감사를 수행했다.

  - **감사 결과(실측, 추측 없음)**:
    - **증분(변경일자) 지원 여부**: 현재 활성 소스 중 서버 측 "변경일자" 기반 증분 조회를 지원하는 API는 하나도 없음을 확인했다 — 서울 열린데이터광장(`culturalEventInfo`/`tvYeyakCOllect`)은 단순 인덱스 범위 페이지네이션만 지원(날짜 파라미터 자체가 없음), data.go.kr 표준데이터류(도시공원/문화공간/문화시설 등)도 동일. TourAPI v4 계열(`KorService2` 등)의 `modifiedtime` 파라미터는 이미 이전 작업(Task 2)에서 "Exact Match(=)로만 동작해 Range 증분이 불가능"함이 실측 확인돼 매일 전량 재수집(Full Ingest)으로 대체돼 있었다. **결론: "변경일자 기반 업데이트"는 현재 어떤 소스에도 적용할 수 없고, 전량 재수집이 정책상 유일하게 유효한 방식 — 이는 이미 스케줄된 8개 어댑터 전부에 이미 반영돼 있었다.**
    - **최초 전체 적재 여부 점검 중 발견한 진짜 문제**: `open_spaces`를 `source_type`별로 전수 집계한 결과, 코드는 이미 완성돼 있고(페이지네이션 포함) 실제 라이브 API 호출도 정상인 **5개 어댑터가 DB에 단 한 건도 적재되지 않은 상태**였다 — `kor-with-tour.mjs`(무장애 여행, 실측 5,041건), `kor-pet-tour.mjs`(반려동반 여행, 857건), `amusement-park.mjs`(유원시설, 2,516건), `public-facility-open.mjs`(공공시설 개방, 7,329건), `playground.mjs`(어린이놀이시설, **82,373건**). 원인: 어떤 GitHub Actions 워크플로에도 연결돼 있지 않아 "최초 전체 수집" 자체가 한 번도 실행된 적이 없었다.
      - 참고로 `kor-tour`/`kor-with-tour`/`kor-pet-tour` 3개 어댑터가 `source_type`/`external_id` 네임스페이스(`KOR_TOUR_API_V4_<contentid>`)를 공유한다는 것도 확인했다 — 실제로 `kor-with-tour`가 반환한 contentid 하나(2656733)가 이미 `kor-tour` 수집분으로 DB에 존재함을 실측으로 확인, 즉 두 서비스는 동일 관광 콘텐츠 데이터베이스를 서로 다른 필터(일반/무장애)로 조회하는 관계라 upsert 시 정상적으로 병합된다(데이터 유실이 아님).
    - **적재 과정에서 발견한 두 번째 버그(스케일 문제)**: `playground.mjs`(82,373건)를 실행하니 `upsertRows()`가 전체 행을 **단일 upsert 호출 하나**로 보내도록 돼 있어 요청이 무한정 멈췄다(실측: 수 분간 DB에 0건 반영). `scripts/ingest/lib/supabase-admin.mjs`에 500건 단위 배치 upsert를 추가해 해결 — 재실행 결과 82,373건 전량 정상 적재됨을 확인. `supabase-admin.test.mjs`에 1,200건 입력 시 500/500/200 배치로 3회 나뉘어 호출되는지 검증하는 회귀 테스트 추가.
    - **실행 불가(진짜 블로커, 임의 값 추측 없이 스킵)**: `national-park-ecotour.mjs`는 `KAKAO_REST_API_KEY` 미설정(원본에 좌표가 없어 지오코딩 필수), `local-data-kids.mjs`는 `LOCAL_DATA_KIDS_CSV_URL` 미설정(localdata.go.kr 실제 CSV 다운로드 URL 필요) — 둘 다 사용자가 직접 발급/확인해야 하는 값이라 임의로 채우지 않고 스킵했다.

  - **조치**:
    1. `kor-with-tour.mjs`(5,041건)/`kor-pet-tour.mjs`(857건)/`amusement-park.mjs`(2,507건)/`public-facility-open.mjs`(7,113건)/`playground.mjs`(82,373건) 전부 **실제로 재실행해 최초 전체 적재 완료**.
    2. `scripts/ingest/lib/supabase-admin.mjs`: `upsertRows()`에 500건 배치 처리 추가(대량 소스의 스케일 버그 수정).
    3. `.github/workflows/ingest-monthly.yml`: `amusement-park.mjs`/`playground.mjs`/`public-facility-open.mjs`(신규)와 `swimming-pool.mjs`/`gg-events.mjs`(기존 데이터는 있었으나 마찬가지로 스케줄 미연결 상태였음)를 월 1회 스케줄에 편입 — 앞으로는 매달 자동으로 전량 재수집돼 정책이 지속 유지된다.
    4. `national-park-ecotour.mjs`/`local-data-kids.mjs`는 필수 환경변수 미설정으로 이번에도 스킵(위 로그 참고, 향후 사용자가 값을 제공하면 즉시 진행 가능).

  - **결과**: `open_spaces` 전체 건수 26,346건 → **118,339건**(약 4.5배 증가). 신규 적재된 데이터도 `sigungu_name`/5대 UI 카테고리가 정상 자동 태깅됨을 표본 확인(예: `LOCALDATA_PLAYGROUND_580379` → 주소 "전라남도 광양시 마동" → `sigungu_name: "광양시"`, `category: "KIDS_ACTIVITY"`).

  - **검증**:
    - `npx tsc --noEmit` / `npm run test`(전체 164/164, 신규 1건 포함) / `npm run build`: 모두 통과.
    - `npm run dev` 기동 후 재검증: 118,339건으로 늘어난 상태에서도 `?sigungu=성남시 분당구` 무료 피드가 여전히 12건 전부 분당구로 정상 노출됨을 확인(대량 데이터 증가가 지역 우선 노출 로직에 영향 없음).

  - **[기존 기능명세서 충돌 및 스킵 로그]**
    - `national-park-ecotour.mjs`: `KAKAO_REST_API_KEY` 미설정으로 스킵. `.env.local`에 Kakao Developers REST API 키 추가 필요.
    - `local-data-kids.mjs`: `LOCAL_DATA_KIDS_CSV_URL` 미설정으로 스킵. localdata.go.kr에서 실제 CSV 다운로드 URL 확인 후 `.env.local`에 추가 필요.

- [x] **[Task 9-1-7~9-1-11 통합] 하단 탭/GPS Fallback/Strict Snap/중복제거 재확인 + 당일 TOP10 + 카테고리 특화 필터 + 가성비 행복 서브탭** 완료 (2026-08-22)

  - **Task 9-1-7/9-1-9 재확인**: `git pull` 후 코드를 직접 확인한 결과 하단 5탭 공통 고정, GPS 2단계 Fallback, 당일 TOP10+D-Day 뱃지+더보기 CTA 전부 이전 세션에서 이미 구현·커밋된 상태임을 재검증(중복 재구현 없음).

  - **[Task 9-1-8] 후속 보정**:
    - **1카드 Strict Snap**: `hero-carousel.tsx`의 카드(및 CTA 슬라이드)에 `[scroll-snap-stop:always]`를 추가 — `snap-center`만으로는 빠르게 스와이프할 때 카드를 2장 이상 건너뛸 수 있어, 드래그 한 번에 정확히 1장씩만 멈추도록 보정했다.
    - **유사 중복 제거**: `get-home-feed.ts`의 `normalizeTitleKey`/`dedupeAndMergeFree`가 이미 이전 세션에서 구현돼 있어 재검증만 하고 코드 변경은 하지 않았다.

  - **[Task 9-1-10] 카테고리 탭 항목 확장 — 실측 확인 결과 원안 그대로는 구현 불가능한 부분 발견**:
    - **DB 실측 확인(추측 없음)**: `open_spaces` 실제 컬럼(`database.types.ts` 생성 타입 기준)은 address/category/facility_type/has_parking/is_free/is_kids_friendly/location/name/sigungu_name/source_type/stroller_accessible/target_age_group 등이며, 지시서가 전제한 `is_pet_friendly`/`accessibility` 컬럼은 **DB에 전혀 존재하지 않음**을 확인했다.
    - **"🐶 반려동물 동반" 스킵(추측 금지)**: 유일한 대안 신호는 "KorPetTourService2(반려동물 동반여행 전용 API) 소스인지 여부"였으나, `tour-api-v4-area-based-adapter.mjs` 코드 주석에 **2026-08-21 사용자 확인**("contentid 기준으로 통합(중복제거) 권장")에 따라 `kor-tour`/`kor-with-tour`/`kor-pet-tour` 3개 어댑터가 `source_type`/`external_id`를 의도적으로 통합해 쓰고 있음을 발견했다 — 이는 실수가 아니라 기존에 승인된 결정이라 이번 지시서를 위해 되돌리지 않았다(제7장 제7조 기획 변경 금지). 따라서 "반려동물 동반" 여부를 구분할 근거가 전혀 없어 이 항목만 스킵했다(임의로 필드를 만들거나 값을 추측하지 않음).
    - **"♿ 무장애/유모차"는 실제 구현**: `stroller_accessible` 컬럼이 실제로 존재하고(기존 "🛺 유모차가능" 뱃지와 동일 필드, `deriveParentalTags`의 실측 텍스트 분석으로 채워짐) 이미 검증된 데이터이므로 그대로 재사용해 구현했다.
    - **"🎁 완전무료"**: `is_free` 필드로 정상 구현.
    - `region-grid-view.tsx`: 1단계 선택 화면에 5대 UI 카테고리와 동급으로 "완전무료"/"무장애·유모차" 타일 2개를 추가. `selection` 상태가 카테고리 값이면 `item.category` 매칭, 특화 필터 키('FREE'/'ACCESSIBLE')면 각각 `is_free`/`stroller_accessible` 필드로 직접 걸러 2단계 리스트에 피딩한다.
    - `region-grid-view.test.tsx` 신규 3건: 특화 필터 타일 노출(반려동물 타일 없음 포함), "완전무료" 클릭 시 `is_free` 필터링, "무장애/유모차" 클릭 시 `stroller_accessible` 필터링 검증.

  - **[Task 9-1-11] "0원의 행복" → "가성비 행복" 서브탭 개편**:
    - `home-view.tsx`: 섹션 헤더를 "💰 가성비 행복"으로 변경하고, "🎁 완전무료"/"⚡ 당일 바로입장"/"👶 키즈특화"/"🎟️ 전체" 4개 서브탭 칩을 추가. 각 탭은 `freeFeed`(이미 `is_free:true`로 걸러진 데이터)를 실제 존재하는 필드로 재분류한다 — 완전무료(`is_free===true`), 당일 바로입장(SPACE는 상시 개방이라 항상 통과, EVENT는 `start_date~end_date`에 오늘이 포함될 때만), 키즈특화(`is_kids_friendly===true`), 전체(필터 없음). 가격 등급 데이터가 없어 "완전무료"와 "전체"는 현재 데이터 모델상 동일한 결과를 보여준다(임의로 가격 등급을 만들어내지 않음, 특이사항으로 기록).
    - `home-view.test.tsx` 신규 4건: 기본 "전체" 탭 노출, 키즈특화/완전무료/당일바로입장 각 탭 필터링 검증.

  - **검증**:
    - `npx tsc --noEmit` / `npm run test`(전체 171/171, 신규 다수 포함) / `npm run build`: 모두 통과.
    - `npm run dev` 기동 후 실측: 홈 화면에 "💰 가성비 행복" + 4개 서브탭 칩 렌더링 확인, HeroCarousel 카드 DOM에 `scroll-snap-stop` 스타일 반영 확인, `/region` 1단계 화면에 "완전무료"/"무장애/유모차" 타일이 5대 카테고리와 함께 노출되고 "반려동물" 문구는 전혀 없음을 확인. 서버 로그 에러/경고 없음.

  - **[기존 기능명세서 충돌 및 스킵 로그]**
    - "🐶 반려동물 동반" 카테고리 항목: `open_spaces`에 이를 뒷받침할 실제 필드가 없고, 유일한 대안(소스별 구분)은 2026-08-21 사용자 확인으로 이미 통합하기로 결정된 사항이라 되돌리지 않고 스킵했다. 반려동물 동반 여부를 구분해 노출하려면 스키마 변경(신규 컬럼) 또는 소스 통합 정책 재검토가 선행돼야 하며, 이는 이번 구현 범위를 넘어서는 별도 Spec 논의가 필요하다.
