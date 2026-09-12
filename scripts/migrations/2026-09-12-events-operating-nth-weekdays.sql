alter table public.events
  add column if not exists operating_nth_weekdays text[];

comment on column public.events.operating_nth_weekdays is
  '매월 N번째 요일에만 운영하는 규칙(예: {2-SAT,4-SAT} = 매월 2번째·4번째 토요일만 운영). NULL/빈 배열 = 이 규칙 없음. operating_weekdays(매주 반복)와는 상호 배타적인 대안 규칙으로 쓴다(둘 다 채워지면 이 컬럼이 우선). excluded_weekdays(정기 휴무)는 이 규칙과도 계속 조합 가능하다.';
