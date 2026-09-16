# [실제 운영일 하이라이트 캘린더 + 운영일 규칙(기간+요일+수동 공휴일 예외)]

## 구현 대상
[개선사항 2] (2026-09-16 todo.md 재배포분): 유저 상세 화면의 "실제 운영일
하이라이트 캘린더 뷰"와 이를 뒷받침할 "운영일 규칙(기간 + 요일 휴무 + 수동
공휴일 예외) 데이터 및 백엔드 로직" 구현.

## 구현 일시
2026-09-16

## 기존 인프라 재사용 범위 (제5장 제4조)
기간(start_date/end_date)과 정기 요일 규칙(operating_weekdays/excluded_weekdays/
operating_nth_weekdays, `isEventOperatingOn`)은 2026-09-12에 이미 구현돼 있었다
— 새로 만든 부분은 **단발성 예외 날짜**(정기 요일 규칙만으로 표현 불가능한
"올해 이 날만은 특별히 쉰다")와, 기간 전체를 순회해 "실제 여는 날짜 배열"을
계산하는 로직, 그리고 유저 화면 캘린더 UI다.

## 변경 사항
### DB (`scripts/migrations/2026-09-16-event-operating-exceptions.sql`)
- `public_holidays(holiday_date pk, name)`: 연도별 공휴일 참고 목록. 여러
  이벤트가 재사용할 수 있도록 이벤트와 독립적으로 둔다.
- `event_operating_exceptions(id, event_id fk, exception_date, note, unique(event_id, exception_date))`:
  이벤트별로 실제 적용되는 예외 휴무일. **모든 이벤트가 공휴일에 자동으로
  쉰다고 가정하지 않는다**(체험/축제 이벤트는 오히려 공휴일이 성수기인 경우가
  많음, 제3장 제5조 추측 금지) — public_holidays는 어디까지나 "고르기 쉬운
  참고 목록"이고, 실제 적용 여부는 이벤트마다 관리자가 결정한다.
- 둘 다 RLS만 켜고 정책 없음(event_price_verifications와 동일 관례, 관리자
  API/서비스 롤 전용).

### 백엔드 순수 로직 (`src/lib/spaces/event-operating-schedule.ts`)
- `isEventOpenOnDate(schedule, exceptionDates, startDate, endDate, date)`:
  기간 밖 → false, 예외 날짜 → false, 그 외엔 기존 `isEventOperatingOn`.
- `computeOperatingDates({schedule, exceptionDates, startDate, endDate})`:
  기간을 하루씩 순회해 실제 운영일 배열을 만든다 — 유저 캘린더가 그대로 쓸
  데이터.

### API
- `GET/POST/DELETE /api/admin/events/operating-exceptions`: 이벤트별 예외
  휴무일 CRUD.
- `GET/POST/DELETE /api/admin/public-holidays`: 공휴일 참고 목록 CRUD(연도별
  조회 지원).
- `GET /api/events/operating-calendar?event_id=`: 유저 화면 공개 조회 —
  `computeOperatingDates` 결과(openDates 배열)만 반환한다. event_operating_exceptions는
  RLS 정책이 없는 테이블이라 이 라우트 내부에서는 반드시 service_role(admin
  클라이언트)로 조회해야 한다(anon으로는 빈 배열만 나와 예외가 조용히
  무시되는 오답이 될 뻔했다 — 구현 중 자체 발견해 수정).

### 관리자 UI
- `operating-exceptions-editor.tsx`: 기존 `operating-schedule-editor.tsx`(정기
  요일 규칙) 바로 아래, 같은 이벤트 블로그 큐레이션 모달 안에 배치. 기간에
  걸친 공휴일 참고 목록을 칩으로 보여줘 클릭 한 번으로 예외 추가, 목록에 없는
  날짜는 직접 입력, 공휴일 참고 목록 자체도 그 자리에서 등록 가능.

### 유저 화면 UI
- `event-operating-calendar-sheet.tsx`: 월별 그리드(일요일 시작 42칸)에 실제
  운영일만 파란색으로 하이라이트, 그 외(기간 밖·정기 휴무·예외 휴무)는 회색
  처리. `detail-modal.tsx`의 "행사 기간" 행에 "📅 달력으로 보기" 버튼을 추가해
  연다(스팟은 기간 자체가 없어 이 버튼도 자연히 안 뜬다).

## 의도적으로 보류한 것: 공휴일 자동 수집 API
요구사항 원문 "해당 테이블로 공휴일 데이터 가져올 수 있는 원천 데이터 소스
수집도 필요.. 연1회면 되니 수동으로 관리자가 하도록 함"에 대해, 한국천문연구원
특일 정보(SpcdeInfoService, data.go.kr)를 이 프로젝트의 `PUBLIC_DATA_API_KEY`로
실제 호출해봤으나 `HTTP 403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR`를 받았다 —
data.go.kr은 서비스마다 계정 소유자가 직접 활용신청을 승인받아야 해서, 구현
AI가 대신 등록할 수 없다. 등록 안 된 상태로 자동 호출 기능을 만들면 항상 같은
에러로 실패하는 죽은 기능이 되고, 실제 응답 스키마도 검증 못 한 채 추측으로
파싱 로직을 짜는 셈이라(제3장 제5조 추측 금지) 이번엔 구현하지 않았다 — 대신
관리자가 직접 공휴일 이름/날짜를 입력하는 CRUD로 "수동 관리"라는 요구사항의
대안 경로(요구사항 원문 "또는 예외 처리 방식")를 충족했다. 서비스가 등록되면
`/api/admin/public-holidays`에 자동 수집 POST 핸들러만 추가하면 된다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1811개, 신규 41개 포함), `npm run build`
  모두 통과.
- 실제 이벤트("[마포구립서강도서관] 8월/어린이 2026 어린이 여름 독서교실")로
  전 구간 실측: 공휴일 등록 → 이벤트에 예외로 추가 → 유저 화면 캘린더 API가
  그 날짜를 openDates에서 정확히 제외 → 삭제 후 원상 복구까지 확인. 테스트
  중 만든 데이터는 정리했다.
