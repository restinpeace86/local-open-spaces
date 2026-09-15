# [개선사항 7] 상단 날씨 위젯 및 실시간·주말 날씨 바텀시트

## 구현 대상
`implementation/todo.md` [개선사항 7] — 홈 헤더 컴팩트 레이아웃(위치/검색/날씨 한 줄),
날씨 위젯 클릭 시 [오늘 실시간]/[이번 주말 예보] 탭 바텀시트.

## 구현 일시
2026-09-15

## 조사 결과 (구현 전 확인한 기존 구조)
요청 원문 "챗봇 백엔드에서 이미 수집 중인 '오늘 실시간 기상 데이터'와 '이번 주말 예보
데이터'"를 그대로 확인한 결과, AI 챗봇 인터뷰 엔진(2026-09-01~04)이 이미 다음을 전부
구현해 두고 있었다 — 이번 작업은 전부 새로 만들지 않고 이 로직을 재사용한다(제5장
제4조 기존 구조 우선):
- `resolveWeatherSnapshot()`(`weather-reaction.ts`): 오늘이면 `spot_weather_caches`
  (3시간 주기 배치, `get_nearest_spot_weather` RPC)의 실측 스냅샷(기온/강수확률/
  미세먼지/초미세먼지 등급까지), 미래 날짜면 KMA 라이브 단기예보만(미세먼지 예보
  자체가 없어 정직하게 안내).
- `recommendMode()`: 강수확률/대기질 기준 야외·실내·무관 판정.
- `resolveThisSaturday()`/`resolveThisSunday()`/`getKstHour()`(`date-resolver.ts`):
  "이번 주" 토/일 날짜를 KST 기준으로 정확히 계산.

## 변경 사항
### 1) 스마트 가이드 문구 (`src/lib/ai-chat/weather-reaction.ts`)
기존 `buildProactiveWeatherSuggestion`/`buildWeatherReactionText`는 챗봇 대화 톤
("이동 거리까지 접수 완료했습니다!")이라 위젯에 맞지 않아, 같은 `WeatherSnapshot`/
`recommendMode` 판단을 재사용하는 짧은 전용 문구 함수 2개를 추가했다:
`buildWidgetGuideMessage`(오늘 탭, 요청 원문 예시 "오늘 미세먼지가 나쁘니 실내
놀이방 식당을 추천해요!" 그대로 반영), `buildWeekendOneLiner`(주말 카드 한 줄평).

### 2) 신규 API (`src/app/api/home/weather/route.ts`)
챗봇 전용 POST 라우트(`/api/ai-chat/weather`, 날짜 하나만 받는 계약)를 그대로 쓰지
않고 이 화면 전용 GET 라우트를 새로 뒀다 — 홈 헤더는 "오늘 + 이번 주말"을 한 번에
다 받아야 하고 인터뷰 진행 상태와 무관해야 하기 때문이다. 내부적으로는 위 1)의
로직을 오늘/토요일/일요일 세 날짜에 각각 적용해 병렬로 계산한다.

### 3) 프론트엔드
- `WeatherWidget`(`src/components/home/weather-widget.tsx`): 헤더 우측 `☀️ 24°`
  미니 위젯. lat/lng이 없으면(위치 미설정) 렌더링 자체를 생략한다. 조회 실패/응답
  모양이 기대와 다르면 조용히 무시하고 헤더 전체를 막지 않는다(제5장 제11조).
- `WeatherBottomSheet`(`src/components/home/weather-bottom-sheet.tsx`): [오늘
  실시간]/[이번 주말 예보] 탭, 미세먼지/초미세먼지 등급 컬러 뱃지, 스마트 가이드
  멘트 박스, 주말 토/일 카드(예보 범위 밖이면 "아직 예보 데이터가 없어요"로 정직하게
  안내 — KMA 단기예보가 약 3일치만 제공해 화요일 등 이른 시점에는 주말 예보가 실제로
  없다).
- `HomeHeader`: 위치 배지(shrink-0)·검색창(flex-1 min-w-0)·날씨 위젯(shrink-0) 한
  줄 flex 레이아웃 — 세 번째 요소가 추가되면 검색창이 자동으로 남는 폭만 차지해
  줄어드는 기존 flex 레이아웃을 그대로 활용(새 계산 로직 불필요).
- `LocationHeader`/`home-view.tsx`: "성남시 분당구" 전체를 보여주던 표시 문구를
  마지막 토큰("분당구")만 보이도록 줄였다 — **표시 전용**이며, 다른 화면에서
  API 쿼리 파라미터(`params.set('sigungu', region.sigunguName)`)로 쓰는
  `sigunguName` 값 자체는 전혀 건드리지 않았다(기존 동작에 영향 없음, 관련 테스트로
  재확인). 위치 배지 `max-w`도 좁혔다(45vw → 28vw).

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1747개, 신규 13개 포함), `npm run build`
  모두 통과.
- 운영 데이터로 `/api/home/weather?lat=37.3789&lng=127.1177`(분당) 실측: 오늘 실시간
  기온 27℃/맑음/강수확률 0%를 정상 반환, 주말(2026-09-19/20)은 오늘(화요일)이
  KMA 단기예보 제공 범위(약 3일) 밖이라 "아직 예보 데이터가 없어요"로 정직하게
  처리됨을 확인(추측으로 채우지 않음 — 버그가 아니라 예보 API 자체의 한계).
- `npm run dev`로 홈 페이지(`/`)가 정상 200 렌더링됨을 직접 확인.
- 헤더 위치 표시 변경으로 기존 테스트 1개가 실패해(전체 sigunguName을 기대) 새 동작에
  맞춰 갱신했다 — sigunguName 값 자체가 API 쿼리에 그대로 쓰이는지 검증하는 별도
  테스트는 그대로 통과함을 재확인해 표시 전용 변경임을 재확인했다.
