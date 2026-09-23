# /partner PC 반응형 프레임 + 하단 탭 4개→3개(주간을 월간으로 흡수)

## 구현 대상
사용자 지시(2026-09-23): "지금 /partner 쪽 인증하고 들어가면 모바일에서
보는사이즈가 아니고 화면이 pc 사이즈처럼되어있어 반응형으로 해야할텐데....
그리고 지금 앱 하단 버튼이 일간/주간/월간/설정 이렇게 4개인데 일간/월간/설정
이렇게 3개로 줄여줘 그리고 월간쪽을 주간과 같이해줘 한달치에 대하여... 주간
처럼 다만 반응형으로 해서 pc에서는 일반달력처럼 보이게 하고 모바일에선 현재
리스트형태로 보여줄수 있어?"

## 검토 및 실측
Playwright + 실제 세션 토큰 주입(이 세션에서 반복 검증해 온 방식 — 매직링크로
`goodguy0515@gmail.com`(실사용 파트너 계정, "괴산 서울농장") 세션을 만들어
쿠키로 주입)으로 nadri-pick.com의 `/partner/today`·`/partner/weekly`·
`/partner/monthly`를 모바일(390px)과 데스크톱(1440px) 두 뷰포트에서 직접
캡처해 확인했다.
- 390px에서는 세 화면 모두 정상 — viewport meta(`width=device-width,
  initial-scale=1`)도 정상, `body.scrollWidth === innerWidth === 390`(가로
  스크롤/오버플로 없음). 즉 "반응형이 아예 안 됨" 같은 기술적 결함은 아니었다.
- 1440px(데스크톱)에서 캡처해보니 하단 탭바와 콘텐츠가 화면 끝까지 그대로
  늘어나 있었다 — 버튼 사이 간격이 부자연스럽게 벌어지고, 온보딩 폼 입력란도
  화면 폭만큼 늘어나는 등 "모바일용 레이아웃이 그냥 넓게 펴진" 모습이었다.
  이게 사용자가 말한 "PC 사이즈처럼 되어있어"의 실체 — 뷰포트 자체는 맞게
  잡히지만, 이 앱 어디에도 넓은 화면에서의 최대 폭 제약이 없어서 생기는
  현상이었다(전체 코드베이스에 md:/lg: 반응형 클래스가 이번 작업 전까지
  전혀 없었음, 실측 확인).

## 1) PC 반응형 프레임
넓은 화면에서는 가운데 정렬된 고정 폭(`max-w-2xl`, 좌우 얇은 테두리) 패널로
감싸고, 모바일 폭에서는 기존과 동일하게 화면 전체를 쓴다.
- `src/app/partner/(tabs)/layout.tsx`: 오늘/월간/더보기 공통 셸에
  `md:mx-auto md:max-w-2xl md:border-x md:border-gray-200` 추가.
- `src/app/partner/onboarding/page.tsx`: 온보딩 폼 입력란이 자체 너비 제약이
  없어 넓은 화면에서 그대로 늘어나던 것을 같은 방식으로 고정.
- `/partner/login`은 이미 로그인 버튼/이메일 폼이 각자 `max-w-xs`로
  자체 제약돼 있어(콘텐츠 자체는 이미 좁고 중앙 정렬) 손대지 않았다 — 배경만
  넓은 건 실제 문제가 아니라고 판단(추측이 아니라 코드 확인).

## 2) 하단 탭 4개 → 3개, 주간 뷰를 월간으로 흡수
- `src/components/partner/partner-bottom-tabs.tsx`: 탭 목록에서 "주간" 제거,
  `grid-cols-4` → `grid-cols-3`(오늘/월간/더보기).
- `src/app/partner/(tabs)/weekly/page.tsx` 및 `weekly-nav.tsx`(전/다음주 이동
  컨트롤러, 더는 쓰이는 곳 없음) 삭제.
- `weekly-day-row.tsx`(`WeeklyDayRow`/`WeeklyBookingSummary`)를
  `day-booking-row.tsx`(`DayBookingRow`/`DayBookingSummary`)로 이름만
  일반화해 이동 — 컴포넌트 자체는 요일 개념과 무관한 "하루 한 줄" 표시
  전용이라 로직 변경 없이 재사용(제5장 제4조).
- `src/app/partner/(tabs)/monthly/page.tsx`: 이제 그 달 전체 예약 원본 행을
  조회해(기존엔 `booking_date, headcount`만 집계용으로 조회했음) 두 가지를
  동시에 준비한다 — 캘린더 그리드용 집계(`aggregateBookingsByDay`, 기존
  로직 그대로)와, 그 달 모든 날짜 각각에 대한 예약 리스트
  (`groupBookingsByDay` + `DayBookingRow`, 기존 주간 뷰와 동일한 형태).
  두 레이아웃을 CSS만으로 전환한다 — 데스크톱(`md:` 이상)에서는
  `MonthCalendarGrid`(기존 컴포넌트 그대로), 모바일에서는 날짜별 리스트를
  `hidden md:block`/`md:hidden`으로 노출/숨김. 기기 판별을 위한 클라이언트
  상태나 User-Agent 분기 없이 뷰포트 폭만으로 반응한다.

## 검증
- `npx tsc --noEmit` / `npm run test`(199개 파일 2,294개 — weekly-day-row/
  weekly-nav 테스트 제거, day-booking-row.test.tsx 신규, partner-bottom-tabs
  테스트를 3탭 기준으로 갱신) / `npm run build` 모두 통과. 빌드 라우트
  출력에서 `/partner/weekly`가 사라지고 `/partner/monthly`는 그대로
  `ƒ`(Dynamic) 유지 확인.
- 배포 후 동일한 Playwright 세션 주입 방식으로 모바일(390px)에서는 월간이
  여전히 날짜별 리스트로, 데스크톱(1440px)에서는 실제 달력 그리드로 보이는지
  + 전체 화면이 더는 끝까지 늘어나지 않는지 재확인 예정(이 기록 갱신).

## 특이 사항
- 이번 검토 중 실사용 파트너 계정(`goodguy0515@gmail.com`, "괴산 서울농장")이
  이미 존재함을 확인했다 — 사용자가 앞서 HQ 슈퍼관리자 계정 논의 때와는 별개로
  본인 소셜 계정으로 실제 파트너 온보딩까지 마친 상태였다.
