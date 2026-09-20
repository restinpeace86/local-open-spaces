# [나드리픽 파트너 PMS — 일간 뷰(오늘의 장부)]

## 구현 대상
사용자 지시(2026-09-20): 파트너 PMS 메인 화면인 일간 뷰(`/partner/today`) 구현.
날짜 이동 컨트롤러(전일/금일/익일/직접 선택), 선택된 날짜의 `bookings`를 RLS로
격리해 시간순 조회, 예약 카드(채널 뱃지/핵심 정보/상태 변경/전화 연결).

## 착수 전 조사
- KST "오늘" 계산은 기존 서버 전용 유틸(`src/lib/admin/kst-date-range.ts`의
  `todayKstDateString`, 관리자 대시보드 집계용으로 이미 검증됨)을 그대로 재사용—
  디렉토리명이 admin이어도 로직 자체는 일반 KST 계산이라 재사용에 문제 없음
  (제5장 제4조). "문자열 날짜에 N일 더하기" 유틸은 이 코드베이스에 전례가 없어
  새로 만들었다.
- `searchParams`를 읽는 `page.tsx`도, dynamic route segment(`[id]`)도 이
  코드베이스에 전례가 없었다 — Next.js 16 규칙(Promise로 받아 await)을 그대로
  따랐다(프레임워크 규칙이라 관례 충돌 없음).
- 예약 출처(네이버 vs 나드리픽 직접)를 색으로 구분한 기존 전례가 없어 이번에
  새로 정했다(네이버=에메랄드 계열, 나드리픽=이 프로젝트 기본 강조색인 파랑 계열).
- `bookings_select_own`/`bookings_update_own` RLS(Phase 1에서 이미 추가)가
  `auth.uid() = partner_id`로 정확히 걸려 있음을 재확인 — 이번 쿼리들은
  `partner_id`를 코드에서 직접 필터하지 않고 전부 RLS에 위임한다(요구사항 2
  "RLS 보안 정책이 정상 작동하는 상태에서" 그대로 충족).

## 변경 사항

### 날짜 유틸 (`src/lib/partner/date.ts`, 신규)
`todayKstDateString`(기존 유틸 재수출) + `addDaysToDateStr(dateStr, days)`(신규,
문자열 기반이라 타임존/DST 영향 없음) + `formatKoreanDateWithWeekday`(상단 헤더
"2026년 9월 20일 (일)" 표시용).

### 페이지 (`src/app/partner/(tabs)/today/page.tsx`, 교체)
Server Component. `searchParams.date`(형식이 안 맞으면 오늘로 안전 폴백,
추측 없이 정직하게 기본값 대체 — 제5장 제11조) 기준으로 세션 클라이언트
(`createClient()`, service_role 아님)로 `bookings`를 `booking_date` 일치 +
`booking_time` 오름차순 조회. 0건이면 정직한 빈 상태 문구.

### 날짜 이동 (`src/components/partner/daily-date-nav.tsx`, 신규)
전일/익일 큰 원형 버튼(44px, 터치 타깃 확보) + 날짜 텍스트를 감싼 투명
`<input type="date">`(네이티브 날짜 선택기 재사용, 커스텀 캘린더를 새로 만들지
않음 — 월간 뷰에서 실제 캘린더 그리드가 필요해지면 그때 별도로 다룰 것)
+ 오늘이 아닐 때만 보이는 "오늘로 이동" 바로가기.

### 예약 카드 (`src/components/partner/booking-card.tsx`, 신규)
- 채널 뱃지: `source==='naver'`→에메랄드, `'nadripik'`→파랑, 그 외 값은 회색
  폴백(알 수 없는 값이 들어와도 화면이 깨지지 않게).
- 예약자명/전화번호(`tel:` 링크)/시간(`HH:MM`만 표시)/인원/메모.
- 상태 변경: 확정/완료/노쇼/취소 4개 pill 버튼, 활성 상태 강조. 클릭 시 **낙관적으로
  즉시 화면에 반영**한 뒤 Server Action(`updateBookingStatus`)을 호출하고, 실패하면
  이전 상태로 되돌리며 에러 메시지 표시 — 성공하면 `router.refresh()`로 서버 상태와
  동기화한다("즉시 DB 반영" 요구사항을 체감 속도까지 포함해 충족).
- 취소된 예약은 카드 전체를 흐리게 표시(`opacity-60`)해 시각적으로 구분.

### Server Action (`src/actions/partner/bookings.ts`, 신규)
`updateBookingStatus(bookingId, status)`: 허용된 상태값인지 검증 → 로그인 확인
→ `bookings.update({status}).eq('id', bookingId)`만 호출(수동 `partner_id`
검증 없음 — RLS가 이미 본인 예약이 아니면 0건 갱신으로 걸러내므로 중복 코드
불필요).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 178개 파일 2103개 테스트 전부 통과(신규 21개 — 날짜 유틸 5개,
  Server Action 4개, BookingCard 6개, DailyDateNav 6개).
- `npm run build` 통과 — `/partner/today`가 이제 `ƒ`(동적, searchParams+DB
  조회로 인해)로 정상 분류됨.
- 실측: dev 서버로 `/partner/today`(+`?date=`) 요청 시 미들웨어가 여전히
  올바르게 `/partner/login`으로 리다이렉트함을 확인(회귀 없음). 페이지 내부의
  실제 Supabase 쿼리(테이블/컬럼명, `booking_date` 필터, 정렬)는 admin 클라이언트로
  동일한 쿼리를 직접 실행해 문법/스키마 오류가 없음을 확인했다.
- 실측 한계: 실제 로그인 세션이 있어야 이 페이지 렌더링 자체가 가능해(미들웨어가
  비로그인 요청을 먼저 걸러냄), 이번에도 브라우저로 실제 로그인한 파트너 계정 +
  실제 예약 데이터로 카드가 정확히 렌더링되는지는 이 세션에서 직접 확인하지
  못했다 — 실제 로그인 가능한 환경에서 한 번 더 실사용 확인을 권장한다.

## 특이 사항 / 다음 단계
- 예약 등록(신규 booking insert) UI는 이번 범위 밖 — 아직 예약 데이터를 만들
  방법이 없어(웹훅/수기 등록 모두 다음 단계) 실제 화면은 당분간 빈 상태로 보일
  것이다.
- 주간/월간 뷰도 이 페이지의 날짜 클릭 시 "일간 뷰로 점프"(spec.md 5절)해야
  하므로, 그 두 화면을 구현할 때 `?date=` 쿼리 파라미터로 `/partner/today`를
  가리키는 링크만 걸면 된다(이 페이지가 이미 그 파라미터를 처리).
