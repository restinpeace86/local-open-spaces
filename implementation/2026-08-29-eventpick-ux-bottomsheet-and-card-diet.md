# [이벤트픽 UX/UI 개선 — 메인 배너 다이어트/카드 규격 통일/전체보기 바텀시트化]

## 요구사항
1. 메인 배너(Hero Carousel)의 거대한 카드 비율을 슬림하게 축소해 아래 섹션이 첫 화면부터 보이게 한다.
2. "현재 이용 가능"/"예약 가능" 가로 슬라이드 카드의 너비·높이를 완전히 통일해 스와이프 시
   흔들림을 없앤다.
3. 기존 3개 "전체보기" 페이지 이동(/events/today, /events/ongoing, /events/reservation-open)을
   스팟픽에서 구현한 슬라이딩 바텀시트 방식으로 대체한다.
4. 바텀시트 상단에 중분류(대분류) 필터 칩을 두어 누르면 즉시 필터링되게 한다.

## 구현 일시
2026-08-29

## 1. 사전 실측(구현 전 확인)

바텀시트에서 "즉시 필터링"을 스팟픽처럼 완전한 클라이언트 사이드 필터링(전량 fetch 후
필터)으로 만들지, 서버 재조회 방식으로 할지 결정하기 위해 실제 데이터 규모를 조회했다
(추측 금지 원칙):
- `getCurrentlyOngoingEventsPage`/`getReservationOpenEventsPage`(전국 대상, 지역 제한 없음)
  대상 건수가 각각 1,972건/918건이고, 중분류(category_min) 종류만 51종에 달함을 실측
  확인했다. 스팟픽(`/nearby`)의 AI 추천처럼 반경 내 소규모 후보군을 전량 내려 클라이언트에서
  거르는 방식과 달리, 이 규모를 매번 전량 내려보내는 것은 과도하다고 판단해 기존 오프셋
  페이지네이션 구조는 유지하고 칩을 클릭할 때마다 서버에 `category_maj` 파라미터를 실어
  1페이지부터 다시 조회하는 방식을 택했다(단일 인덱스 쿼리라 체감 지연은 작다).
- 필터 칩 단위는 51종 중분류를 그대로 쓰지 않고, 기존 홈 화면 "카테고리별 행사"
  (`MajorCategoryGrid`)가 이미 쓰고 있는 7대 대분류(`category-maj-meta.ts`의
  `CATEGORY_MAJ_OPTIONS`)를 그대로 재사용했다(제5장 제4조 기존 구조 우선) — 사용자가 예시로
  든 "축제, 체험, 교육, 공연"과 실제 대분류 라벨("축제 / 이벤트", "체험 / 농장", "배움 / 클래스",
  "문화 / 전시")이 사실상 일치해 새 taxonomy를 만들 근거가 없었다.

## 2. 요구사항 1: 메인 배너 다이어트 (`hero-carousel.tsx`)

이미지 영역의 `aspect-[4/3]`(세로에 가까운 비율)를 `aspect-[2/1]`(가로형 배너 비율)로
교체했다. 폭이 그대로일 때 동일 폭 기준 이미지 높이가 약 33% 줄어들어(예: 343px 폭
기준 257px→172px) 카드 전체 높이가 눈에 띄게 슬림해지고, 아래 "현재 이용 가능" 등 섹션이
첫 화면에 더 가깝게 보인다. 카드 안 배지/텍스트 레이아웃 자체는 바꾸지 않았다(제7장 제2조
임의 UI 변경 최소화 — 비율 수치만 조정).

## 3. 요구사항 2: 슬라이드 카드 규격 통일 (`event-card.tsx`, `reservation-open-slider.tsx`)

- `EventCard` 버튼에 `h-full`을 추가하고 콘텐츠 영역에 `flex-1`을 줘서, 부모가 정한 높이를
  그대로 채우게 했다. 부모가 높이를 지정하지 않는 기존 화면(카드 그리드 등)에서는
  `height:auto`와 동일하게 동작해 기존 모습에 영향이 없다.
- `ReservationOpenSlider`의 카드 래퍼에 고정 높이(`h-64`)를 추가했다 — 기존에도 폭은
  `w-40`으로 고정돼 있었으나 높이가 콘텐츠(뱃지/제목 줄바꿈 유무)에 따라 제각각이었다.
  플렉스 행(`flex`, 기본 `align-items: stretch`)에서 래퍼가 그 높이만큼 늘어나고,
  `EventCard`의 `h-full`이 그 늘어난 높이를 그대로 채운다.
- 타이틀(`line-clamp-2`)에 `min-h-[2.5rem]`을 추가해 1줄짜리 제목도 2줄 분량의 공간을
  항상 예약하게 해, 제목 줄바꿈 유무로 인한 흔들림도 없앴다.

## 4. 요구사항 3/4: 전체보기 바텀시트化 + 중분류 필터 칩

### 신규 컴포넌트 `event-browse-sheet.tsx`
스팟픽의 `AiRecommendSheet`/`MarkerGroupModal`과 동일한 바텀시트 시각 패턴
(`fixed inset-0 bg-black/40 ... items-end md:items-center`, 배경 클릭/✕로 닫힘)을 그대로
따르는 `EventBrowseSheet`를 새로 만들었다. `mode: 'today' | 'ongoing' | 'reservation-open'`
하나로 기존 3개 전체보기 화면을 전부 대체한다:
- `today` 모드만 기존처럼 지역 선택 `<select>`를 상단에 유지한다(원래도 페이지네이션이
  없던 화면이라 "더 보기"가 없음).
- `ongoing`/`reservation-open` 모드는 기존 오프셋 페이지네이션(`page`/`page_size=24`)을
  그대로 쓰고, "더 보기" 버튼으로 다음 페이지를 이어붙인다.
- 상단 칩(전체 + 7대 대분류)을 누르면 `category_maj` 쿼리 파라미터를 실어 1페이지부터
  즉시 재조회한다(같은 칩을 다시 누르면 해제).

**[실측 디버깅 발견](2026-08-29, 이번 세션 스팟픽 작업에서 확인된 이슈 재적용)**: 이 시트는
"전체보기" 버튼의 React onClick으로 열리므로, `history.pushState`를 호출하는
`useModalBackClose`는 쓰지 않는다(배경 클릭/✕ 버튼으로만 닫힘) — 그 훅을 React onClick
경로에서 쓰면 상태 업데이트가 조용히 되돌아가거나 전체 리로드급 문제가 생기는 것을
`ai-recommend-sheet.tsx` 작업에서 이미 확인했다.

### 서버 쿼리 확장 (`get-home-feed.ts`)
`getTodayEvents`/`getCurrentlyOngoingEventsPage`/`getReservationOpenEventsPage` 3개 함수
모두 세 번째 인자로 `categoryMins?: readonly string[]`를 받아, 있으면
`.in('category_min', categoryMins)`를 추가로 건다(기존 3대 조건 필터는 그대로 유지).

### API 라우트 확장
`/api/events/today`, `/api/events/ongoing`, `/api/events/reservation-open` 3개 라우트
모두 `category_maj` 쿼리 파라미터를 받아 `CATEGORY_MAJ_OPTIONS`에서 일치하는 대분류를 찾아
그 `minorCategories` 배열을 위 함수들에 넘긴다. 유효하지 않은 값은 조용히 무시하고
전체 조회로 폴백한다(에러를 던지지 않음 — 제5장 제11조 오류 처리 원칙).

### `home-view.tsx`/`hero-carousel.tsx` 연동
- `HeroCarousel`의 `moreHref: string` prop을 `hasMore: boolean` + `onMoreClick: () => void`로
  교체했다(CTA 카드/Floating 버튼 모두 `<Link>`에서 `<button onClick>`으로 변경).
- "현재 이용 가능"/"예약 가능" 헤더의 "전체보기 →" `<Link>`도 각각 해당 모드로
  `EventBrowseSheet`를 여는 버튼으로 교체했다.
- `HomeView`에 `browseSheetMode` 상태 하나만 추가해 세 종류의 전체보기를 하나의 컴포넌트로
  처리한다. 시트에서 카드를 선택하면 시트를 닫고 기존 `DetailModal`을 그대로 연다(기존
  카테고리 그리드 인라인 피딩과 동일한 종착점 재사용).

### 페이지 삭제
`src/app/events/today/page.tsx`(+`page.test.tsx`), `src/app/events/ongoing/page.tsx`,
`src/app/events/reservation-open/page.tsx`를 삭제했다 — "전면 폐기"가 요구사항이라 페이지
이동 경로 자체를 남겨두지 않았다. 세 라우트가 쓰던 API(`/api/events/today` 등)는 그대로
유지해 바텀시트가 재사용한다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과(스테일 `.next/types` 캐시가 삭제된 페이지를 참조해 한 차례 에러가
  났으나 `.next` 삭제 후 재실행해 해결 — 삭제된 라우트의 타입 선언이 남아있던 것뿐, 실제
  코드 문제 아님).
- `npm run test`(60파일 604건, 신규 `event-browse-sheet.test.tsx` 7건 포함) 통과.
- `npm run build` 통과 — 빌드 라우트 목록에서 `/events/today`, `/events/ongoing`,
  `/events/reservation-open` 페이지가 사라지고 API 라우트 3개만 남은 것을 확인했다.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- `npm run dev`로 기동해 홈(`/`) 200 OK 확인.
- `/api/events/ongoing?page=1&page_size=3`(필터 없음)과
  `/api/events/ongoing?...&category_maj=자연 / 캠핑`(필터 적용) 응답을 비교해, 필터 적용 시
  실제로 해당 대분류의 중분류(`산림여가`)만 반환되는 것을 실측 확인했다.

## 특이 사항
- Above the fold 여부의 정확한 판정은 실제 기기 화면 크기에 따라 달라져 이번 검증에서는
  코드 레벨(비율 축소)까지만 확인했다 — 브라우저 자동화 도구가 이번 환경에 없어 실제 렌더된
  픽셀 높이를 눈으로 캡처해 비교하지는 못했다. 이 점은 사용자가 실제 화면에서 한 번 더
  확인해 주는 것을 권장한다.
- "오늘 전체보기" 모드는 원래 화면 그대로 지역 선택 + 무한 페이지 없는 단일 조회 구조를
  유지했다(요구사항이 페이지 이동 방식 폐기이지, 지역 선택 UI 자체를 없애 달라는 것은
  아니었음 — 제3장 제5조 추측 금지, 명시된 범위만 변경).
