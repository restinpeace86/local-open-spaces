# [개발 요청] 스팟픽(SpotPick) AI 맞춤 추천 챗봇 엔진 구현

## 구현 일시
2026-09-01

## 배경
스팟픽(/nearby)·이벤트픽(/calendar) 화면에 플로팅 바텀시트 형태의 8단계 AI 맞춤 추천
인터뷰 챗봇을 신규로 구현했다. 기존 "AI 추천" 칩(`AiRecommendSheet`, 2026-08-29,
LLM 미사용 규칙기반 스마트 정렬)과는 사용자가 명시적으로 구분한 완전히 별개의 신규
기능이다.

## 구현 내용

### LLM 토큰 최적화(요구사항 2-①) — 핵심 설계 원칙
1~8단계 인터뷰 전체에서 LLM을 단 한 번도 호출하지 않는다. 프론트엔드 상태 머신
(`ai-chat-sheet.tsx`)과 백엔드 템플릿 리터럴 조합(`step-options.ts`,
`weather-reaction.ts`)만으로 처리한다. LLM(Gemini)은 8단계가 모두 끝난 뒤 최종 요약
문구 생성 1회에만 호출된다(`summary.ts`) — 실패/키 없음 시 템플릿으로 우아하게
폴백해 서비스가 끊기지 않는다(제5장 제11조).

### 5단계(Weather & Air) — 날씨/대기질 데이터 소스가 날짜에 따라 근본적으로 다름
- **오늘**: 직전 두 작업에서 구축한 `spot_weather_caches`(KMA+에어코리아 3시간 주기
  배치) 캐시를 그대로 재사용한다. 사용자 위치 기준 "가장 가까운" 캐시를 찾기 위해
  신규 RPC `get_nearest_spot_weather`(open_spaces와 조인, 거리순 1건)를 만들었다.
  - **실측으로 발견한 버그**: `spot_weather_caches`는 RLS를 켜고 정책을 하나도 두지
    않아(service_role 전용) 기본 `SECURITY INVOKER` 함수로는 anon 키 호출 시 항상
    빈 결과를 반환했다(관리자 연결로는 정상, PostgREST anon 경로만 실패 — 직접 실측
    확인). `security definer set search_path = public`으로 수정해 해결했다.
- **오늘이 아닌 날짜**(내일/이번 주 토·일/직접선택): 에어코리아 실시간 API는 미래
  미세먼지 예보 자체가 존재하지 않아(추측 금지) 기온/강수확률/하늘상태만 KMA
  단기예보를 라이브로 직접 조회해 보여주고, 미세먼지는 "그 날이 가까워져야 안다"고
  정직하게 안내한다. `kma-forecast.ts`(신규, Next.js 서버 런타임 전용 TS 미러 —
  `.mjs` 인제스트 스크립트의 CLI 진입점이 `process.argv[1]` undefined 시 즉시
  throw하는 부작용이 있어 그대로 import할 수 없음, `kma-grid.ts`도 동일 이유로 미러)
  가 `getVilageFcst`의 한 응답 안에 담긴 여러 미래 슬롯 중 목표 날짜와 정확히
  일치하는 슬롯만 골라 쓴다(예보 범위 밖이면 null, 추측하지 않음).

### 4단계(검색/랭킹) — `search-engine.ts`(순수 함수, DB 접근 없음)
- **성향(Vibe) → category_min 매핑**: 8단계 선택지(신나게 뛰어놀기/교육 및 체험/힐링
  자연/문화 즐기기) 4개를 `CORE_SPOT_CATEGORIES`(spot-category-groups.ts)의 나들이
  전용 핵심 중분류에 1:1로 매핑했다(키즈친화 식당은 3단계 Meal이 별도 처리).
- **"공공시설" 판정**: 이 카탈로그는 대부분 공공데이터 출처지만 키즈카페/키즈친화
  식당(놀이방식당)만 민간 사업자 데이터임을 이전 어댑터 작업에서 이미 확인했다 —
  그 둘을 제외한 나머지를 공공시설로 취급해 필수 믹스 룰 ①을 판정한다.
- **예산(Budget) 필터의 데이터 한계**: `open_spaces`에는 `is_free`만 있고 실제
  이용료 숫자 컬럼이 없다(project/database_schema.md 확인) — "완전 무료"만 정확히
  필터링 가능하고 나머지 구간(1만원 이하/2~3만원 이하/상관없음)은 필터를 걸지 않는다
  (정직한 데이터 한계, 추측으로 숫자를 만들지 않음).
- **1회성 완화(Soft Fallback)**: "한 단계 넓힌다"의 기준을 4단계(Transport & Distance)
  선택지 자체의 반경 단계(도보 1km→차10분 5km→30분 15km→1시간+ 40km)로 정의했다
  (지정되지 않아 내린 구현 판단). 완화 1회로도 0건이면 즉시 중단하고 요구사항이
  명시한 문구를 그대로 반환한다: *"차선책까지 가격/거리를 조정하여 찾아보았으나
  조건에 맞는 적합한 곳을 찾지 못했습니다"*.
- **필수 믹스 룰**: ① 공공시설이 상위 결과에 하나도 없으면 최하위 항목을 최선의
  공공시설 후보로 교체, ② 활성 `curated_items` 1건을 결과 끝에 자연스럽게 섞는다
  (실제 활성 상품이 없으면 억지로 만들지 않음). 최대 10개 상한 준수.
- **실측으로 발견한 성능 함정 및 재설계**: 처음에는 "폴백 대비 가장 넓은 반경
  (40km)으로 미리 넉넉히 조회"하는 방식으로 구현했으나, `open_spaces` 141,980행
  규모에서 40km 반경 조회가 라이브 서버(anon 키 PostgREST 경로)로 실제 8초
  statement_timeout에 걸렸다(관리자 연결로는 7.9초로 아슬아슬하게 통과 — 안정적으로
  보장할 수 없는 위험 수준임을 실측 확인). API 라우트를 "사용자가 실제 선택한
  반경으로 먼저 조회 → 0건일 때만 다음 반경으로 딱 한 번 더 조회"하는 2단계 왕복
  구조로 재설계해 대부분의 요청이 좁은/중간 반경만 조회하도록 고쳤다 — 이 구조가
  요구사항 4의 "1회성 완화"와도 정확히 일치한다. 이에 맞춰 `search-engine.ts`도
  `applyStrictFilters`/`assembleResults`를 독립적으로 export해 API 라우트가 직접
  조합할 수 있게 분리했다(기존 `runSearch`는 단위 테스트/소규모 시나리오 전용으로
  유지).

### 요구사항 4의 나머지 항목
- **거리 표시**: 상위 10개 결과는 `get_nearby_spaces_and_events` RPC가 이미 계산해
  내려주는 `distance_meters`를 그대로 `formatDistance()`(기존 유틸 재사용)로
  노출한다 — 대상이 10개로 한정돼 추가 연산 부담이 없다.
- **키즈친화 맛집 지연 로딩**: `Meal=예`일 때만 결과 하단에 "🍽 근처 키즈친화 맛집
  보기" 버튼을 노출하고, 클릭 시에만(초기 일괄 로딩 없음) 신규
  `/api/ai-chat/nearby-restaurants`를 호출한다. 반경 1km→3km→5km를 실제로 순차
  재조회하며 첫 결과가 나오는 즉시 멈춘다(요구사항 원문 "거리를 조금씩 넓혀가며
  탐색"을 문자 그대로 구현 — 한 번에 넉넉한 반경을 조회하는 방식이 아님).

### UI: 플로팅 FAB + 바텀시트(`src/components/chat/`)
- `ai-chat-fab.tsx`: 우측 하단 FAB(🤖) — `/nearby`(map-explorer.tsx)와
  `/calendar`(calendar-view.tsx) 양쪽에 동일 컴포넌트를 그대로 마운트했다.
  `/calendar`에는 기존에 위치 온보딩 흐름이 없었는데, 챗봇 좌표만 조용히
  가져다 쓰고(미설정 시 `useUserLocation` 기본값인 서울시청 자동 폴백) 그 화면에
  새 온보딩 모달을 추가하는 것 같은 무관한 UX 변경은 만들지 않았다(범위 최소화).
- `ai-chat-sheet.tsx`: 메시지 로그(말풍선) + 단계별 칩 UI를 갖는 상태 머신. 결과
  카드 클릭 시 기존 `DetailModal`을 그대로 재사용한다(중복 구현 없음).

## 신규 파일
- `scripts/migrations/2026-09-01-create-get-nearest-spot-weather-rpc.sql`(DB 적용 완료)
- `src/lib/ai-chat/`: `date-resolver.ts`, `kma-grid.ts`, `kma-forecast.ts`,
  `weather-reaction.ts`, `search-engine.ts`, `step-options.ts`, `summary.ts`
  (+ 각각의 `.test.ts`)
- `src/lib/http/fetch-with-timeout.ts`(TS 경량 버전)
- `src/app/api/ai-chat/{weather,search,nearby-restaurants}/route.ts`
- `src/components/chat/{ai-chat-fab,ai-chat-sheet}.tsx`
- `src/types/database.types.ts` 갱신(신규 RPC 타입 반영, `npx supabase gen types
  typescript --linked`로 재생성 — diff로 새 RPC 항목 외 변경 없음을 확인)

## 검증

### 코드 검증
`npx tsc --noEmit`/`npm run test`(87파일 876건 — 신규 7파일 58건)/`npm run build`
통과.

### 실측 검증(실제 KMA/에어코리아 API, 실제 프로덕션 DB, 로컬 개발 서버 + 실제 브라우저)
- KMA/에어코리아 어댑터로 실제 스팟 8건에 날씨/대기질 캐시를 미리 채워 검증용
  데이터를 확보.
- `/api/ai-chat/weather`: 오늘 날짜 → `get_nearest_spot_weather` RPC로 실제 캐시값
  (기온 24℃, 강수확률 30%, 흐림, 미세먼지 '좋음')을 정확히 반영한 리액션 문구 확인.
  내일 날짜 → KMA 라이브 예보(기온 28℃ 등 실제 값)로 정확히 전환되고 미세먼지는
  "그 날이 가까워져야" 문구로 정직하게 처리됨을 확인.
- `/api/ai-chat/search`: (1) 정상 매칭 → 실제 근처 공원 9곳 + 제휴 상품 1곳 총
  10개, 거리순 확인. (2) 1000m에서 0건 → 5000m로 완화해 성공(`usedFallback:true`)
  확인 2건(문화/교육 성향). (3) 원격 좌표(동해상)로 완화 후에도 0건 → 요구사항이
  명시한 문구 그대로 반환됨을 확인. LLM 요약 문구가 실제 Gemini 호출로 자연스럽게
  생성됨을 확인.
- `/api/ai-chat/nearby-restaurants`: 실제 키즈친화 식당 좌표에서 1km 이내 5건(상한)
  정상 반환, 데이터 없는 지점에서는 5km까지 확장 후 빈 배열로 우아하게 종료됨을 확인.
- Playwright로 `/nearby`·`/calendar` 양쪽에서 FAB 노출 확인, `/nearby`에서 전체
  8단계(오늘→점심 전→밖에서 식사→차로 30분→둘 다→상관없어요→2명→다양한 연령→힐링
  자연)를 실제로 진행해 최종 결과 요약 말풍선과 맛집 지연 로딩 버튼까지 정상 렌더링
  확인.
- 검증에 쓴 8건의 `spot_weather_caches` 테스트 행은 검증 직후 전량 삭제해 DB를
  원상 복구했다.

## 특이 사항 / 구현 판단 요약(요구사항이 명시하지 않아 직접 결정한 부분)
- 시간대(점심 전/점심 먹고/오후/저녁) → 날씨 조회용 대표 시각(10/13/15/18시) 매핑.
- 이동 거리 선택지 → 실제 반경(1km/5km/15km/40km) 매핑.
- 아이 연령대는 `open_spaces.target_age_group`의 실제 도메인 값(영유아/초등/전연령)
  과 정확히 일치시켰다(존재하지 않는 값을 추가하지 않음).
- 성향(Vibe) 4분류 → category_min 매핑, 시/도 단위 대기질처럼 이미 확정된 매핑
  관례를 그대로 재사용.
- 예산 필터의 데이터 한계(위 본문 참고)와 시/도 단위 대기질 집계 한계(직전 작업에서
  이미 문서화)는 그대로 승계된다.
