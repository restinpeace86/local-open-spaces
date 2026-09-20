# [나드리픽 파트너 PMS — 주간 뷰 및 월간 뷰]

## 구현 대상
사용자 지시(2026-09-20): `/partner/weekly`(주간 이동 + 7일 그룹 요약 + 일간 뷰
점프), `/partner/monthly`(월 이동 + 총합계 칩 + 캘린더 그리드 + 날짜별 건수 +
일간 뷰 점프) 구현.

## 변경 사항

### 날짜 유틸 확장 (`src/lib/partner/date.ts`)
`getMondayOfWeek`(주간 뷰는 spec.md 5절 "월~일" 순서라 월요일을 주 시작으로),
`getFirstDayOfMonth`/`getLastDayOfMonth`(윤년 처리는 `Date.UTC(y, m, 0)`이 자동
보정), `addMonthsToDateStr`(항상 1일로 정규화해 "31일+1달=존재하지 않는 날짜"
문제를 원천 차단), `formatMonthDayWithWeekday`/`formatKoreanYearMonth` 추가.

### 집계 로직 분리 (`src/lib/partner/aggregate-bookings.ts`, 신규)
`groupBookingsByDay`(주간용, 날짜별 배열 그룹핑), `aggregateBookingsByDay`
(월간용, 날짜별 건수/인원 + 전체 총합계). 페이지 컴포넌트 안에 인라인으로 두면
테스트하기 어려운 로직이라 순수 함수로 분리했다 — DB GROUP BY 대신 앱 레이어
집계(이 프로젝트의 기존 관례, 한 파트너의 한 달 예약량 규모면 충분).

### 주간 뷰
- `src/components/partner/weekly-nav.tsx`: 전주/다음주 이동 + "이번주로 이동"
  (DailyDateNav와 동일한 시각 관례).
- `src/components/partner/weekly-day-row.tsx`: 요일별 1행 — "일자 / 예약 건수·
  인원 합계" 헤더 + 예약 각각을 "시간 · 이름 · 인원" 한 줄씩(spec.md 5절 원문
  그대로). 취소 건은 취소선으로 구분. 상태 변경 등 조작 UI는 없다(그건 일간
  뷰의 몫) — 그래서 순수 표시용 서버 컴포넌트(Link 하나)로 충분해 클라이언트
  컴포넌트로 만들지 않았다. 행 전체가 `/partner/today?date=...`로 연결된다
  (요구사항의 크로스 내비게이션).
- `src/app/partner/(tabs)/weekly/page.tsx`: `?date=`(월요일 아닌 임의 날짜여도
  그 주의 월요일로 보정) 기준 월~일 7일 범위를 세션 클라이언트로 조회.

### 월간 뷰
- `src/components/partner/monthly-nav.tsx`: 전월/다음달 이동 + "이번달로 이동".
- `src/components/partner/month-summary.tsx`: "이번 달 총 예약 N건 · 총 방문
  인원 M명" 칩 2개. 확정/완료/노쇼/취소를 가려 세는 기준은 지시되지 않아
  추측하지 않고 전체를 합산했다(제3장 제5조) — 필요시 추후 상태별 집계로 확장
  가능하도록 별도 함수(`aggregateBookingsByDay`)로 분리해 뒀다.
- `src/components/partner/month-calendar-grid.tsx`: 월~일 순서 캘린더 그리드
  (주간 뷰와 요일 배치 통일 — 두 화면을 오갈 때 요일 순서가 뒤바뀌어 보이지
  않게). 앞뒤 빈 칸으로 항상 7의 배수 행을 유지, 토요일/일요일 헤더는 관례대로
  파랑/빨강으로 구분. 예약이 있는 날짜만 건수 뱃지 표시, 오늘 날짜는 링 강조.
  각 날짜 칩이 `/partner/today?date=...`로 연결된다.
- `src/app/partner/(tabs)/monthly/page.tsx`: `?date=` 기준 해당 월 전체 범위를
  세션 클라이언트로 조회 후 집계.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 186개 파일 2165개 테스트 전부 통과(신규 38개 — 날짜 유틸
  12개, 집계 함수 5개, WeeklyNav 5개, WeeklyDayRow 5개, MonthlyNav 5개,
  MonthSummary 2개, MonthCalendarGrid 4개).
- `npm run build` 통과 — `/partner/weekly`, `/partner/monthly` 모두 `ƒ`(동적)로
  정상 생성.
- 실측: admin 클라이언트로 주간/월간 페이지가 실행하는 것과 동일한 범위 쿼리를
  직접 실행해 문법/스키마 오류 없음을 확인. dev 서버로 두 라우트 모두 미들웨어가
  여전히 올바르게 `/partner/login`으로 리다이렉트함을 확인(회귀 없음).
- 실측 한계: 이번에도 실제 로그인 세션이 필요해 브라우저로 실제 예약 데이터가
  주간/월간 뷰에 올바르게 집계·표시되는지는 이 세션에서 직접 확인하지 못했다.

## 특이 사항
- 캘린더 요일 순서(월~일)는 spec.md 5절이 명시한 주간 뷰 순서를 월간 뷰에도
  그대로 적용한 것으로, 한국 앱 관례상 흔한 일~토 캘린더와는 다르다 — 사용자가
  다른 순서를 원하면 `WEEKDAY_HEADERS` 상수 하나만 바꾸면 된다.
- 월간 총합계가 상태(취소 포함) 구분 없이 전체 건수를 세는 것은 추측 없이
  내린 기본값이다 — "확정 건만 집계"를 원하면 `aggregateBookingsByDay` 호출
  전에 필터를 추가하면 된다.
