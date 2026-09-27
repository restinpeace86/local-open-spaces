-- [open_spaces 정기휴무 설정](2026-09-27 사용자 지시): "이거 이벤트쪽에 있나
-- 휴관일이나 정기휴무 설정하는거... 이거 open_spaces쪽에도 놓고.. 정기휴무
-- 설정할수있게해야하는거 아니야?" — events에 이미 있는 excluded_weekdays(정기
-- 휴무 요일)/operating_nth_weekdays(매월 N번째 요일) 중, 범위를 "정기휴무 요일
-- + 매월 N번째 요일 휴무"로만 좁혀(사용자 확인 — open_spaces는 상설 장소라
-- operating_weekdays/operating_specific_dates는 상대적으로 덜 쓰임) open_spaces에
-- 새 컬럼 2개를 추가한다.
--
-- events의 operating_nth_weekdays는 "매월 N번째 요일에만 운영"(운영 패턴)이지만,
-- open_spaces에서 필요한 건 반대 극성("매월 N번째 요일에 추가로 휴무")이라 이름을
-- 다르게 지었다(excluded_nth_weekdays) — 같은 이름에 반대 의미를 주면 혼란을
-- 유발한다. 토큰 형식("N-요일코드", 예: "1-MON")은 이벤트 쪽과 동일하게
-- src/lib/spaces/event-operating-schedule.ts의 buildNthWeekdayToken/
-- parseNthWeekdayToken을 그대로 재사용한다(범용 유틸이라 events 전용 로직이 아님).
alter table public.open_spaces
  add column if not exists excluded_weekdays text[],
  add column if not exists excluded_nth_weekdays text[];
