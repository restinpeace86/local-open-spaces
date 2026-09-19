-- [스팟 큐레이션 요일별 영업시간](2026-09-19 사용자 지시): "지금 스팟큐레이션에서는
-- 영업시작 영업종료 브레이크 시작 브레이크 종료 라스트오더 이렇게만 있어서.. 요일별로
-- 시간 담을 수 있게" — 기존 open_time/close_time(단일 값)은 그대로 두고(하위 호환,
-- 제5장 제3조 — 기존 값 지우지 않음), 요일별 영업시작/영업종료만 담는 필드를 추가한다.
-- 배열 형태: [{day: "월", open: "09:00", close: "18:00"}, ...] 최대 7개.
-- 브레이크타임/라스트오더는 요청 범위 밖이라(사용자가 "영업시작 영업종료"만 명시) 기존
-- 단일 필드(break_start/break_end/last_order) 그대로 유지한다.
alter table public.spot_curations
  add column if not exists operating_hours_by_day jsonb;

comment on column public.spot_curations.operating_hours_by_day is
  '요일별 영업시작/영업종료. [{day, open, close}] 형태(최대 7개). null이면 기존 단일 open_time/close_time만 사용.';
