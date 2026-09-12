-- [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자 지시):
-- "상세팝업에서 표준 중분류 선택 → 타겟 연령 선택 → 블로그 검증 → 스팟 연결.. 여기에
-- 일자는 기본적으로 원천데이터꺼로 하긴 하는데 예외 규칙을 여기서 집어넣으면 해당
-- 예외 규칙도 적용되도록" — 원본 API의 start_date~end_date(기간)는 그대로 두고,
-- 그 기간 "안"에서도 특정 요일에만 운영하거나 특정 요일엔 휴무인 경우를 관리자가
-- 예외로 지정할 수 있게 한다.
--
-- 요구사항 원문의 3개 프리셋(주말만 운영 / 특정 요일 지정 / 정기 휴무일 제외)은
-- 실제로는 서로 다른 두 개념이다 — "주말만 운영"과 "특정 요일 지정"은 둘 다
-- "허용 요일 목록"(하나가 비면 매일 허용)의 다른 입력 방식일 뿐이고, "정기 휴무일
-- 제외"는 그 위에 독립적으로 덧씌워지는 "제외 요일 목록"이다(둘을 조합할 수 있어야
-- 한다 — 예: "매일 운영이지만 매주 월요일만 휴무"). 그래서 컬럼은 2개로 충분하다.
--
-- 값은 3-letter 요일 코드(SUN/MON/TUE/WED/THU/FRI/SAT)의 배열. NULL 또는 빈
-- 배열이면 "제약 없음"(운영 요일은 전부 허용, 휴무 요일은 없음)을 뜻한다 —
-- 기존 이벤트 전체가 이 컬럼 도입 이전과 동일하게 "매일 운영"으로 취급된다
-- (하위 호환, 기본값 NULL).
alter table public.events
  add column if not exists operating_weekdays text[],
  add column if not exists excluded_weekdays text[];

comment on column public.events.operating_weekdays is
  '이 기간 중 실제로 운영하는 요일 목록(3-letter 코드, 예: {SAT,SUN}). NULL/빈 배열 = 매일 운영(기본값, 하위 호환).';
comment on column public.events.excluded_weekdays is
  '정기 휴무 요일 목록(3-letter 코드, 예: {MON}). NULL/빈 배열 = 휴무 없음(기본값). operating_weekdays와 조합 가능(예: 매일 운영 + 월요일만 휴무).';
