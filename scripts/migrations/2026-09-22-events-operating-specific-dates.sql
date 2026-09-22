-- [운영 요일/반복 규칙에 "특정 날짜 지정" 모드 추가](2026-09-22 사용자 지시): "그거
-- 사용자가 일자 선택으로도 지정할 수 있게 해줘 지금은 토일이라던가 월 수 반복이라던가
-- 밖에 안되는데 .. 17일 20일 이런식으로 운영하는경우가 있어서" — 기존
-- operating_weekdays/excluded_weekdays/operating_nth_weekdays는 전부 "요일 기반
-- 반복" 규칙이라 "이번 달 17일·20일에만 운영"처럼 특정 날짜만 운영하는 경우를 표현할
-- 수 없었다. 실제 달력 날짜(YYYY-MM-DD) 목록을 저장하는 새 컬럼을 추가한다.
--
-- 값이 채워져 있으면 다른 요일 기반 규칙(operating_weekdays/excluded_weekdays/
-- operating_nth_weekdays)보다 우선하며, 그 규칙들을 완전히 무시한다(isEventOperatingOn
-- 참고) — "17일만 운영"으로 지정했는데 excluded_weekdays에 걸려 다시 막히는 것 같은
-- 헷갈리는 이중 부정을 피하기 위해 이 모드를 선택하면 전적으로 이 목록만 신뢰한다.
alter table public.events
  add column if not exists operating_specific_dates text[];

comment on column public.events.operating_specific_dates is
  '특정 날짜만 운영하는 규칙(예: {2026-09-17,2026-09-20}). NULL/빈 배열 = 이 규칙 없음(기존 요일 기반 규칙 사용). 채워져 있으면 operating_weekdays/excluded_weekdays/operating_nth_weekdays를 모두 무시하고 이 날짜 목록만 따른다.';
