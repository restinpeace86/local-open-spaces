-- [이벤트픽 성능 개선](2026-09-15 사용자 지시, implementation/todo.md [개선사항 1])
-- 이벤트픽의 거의 모든 조회(getTodayEvents/getTodayEventsPage/getReservationOpenEvents/
-- getOngoingEvents 등, src/lib/home/get-home-feed.ts)가 동일한 패턴을 쓴다:
--   WHERE is_active = true AND end_date = <오늘> (또는 >= <오늘>)
--   ORDER BY end_date ASC
-- 기존 idx_events_dates는 (start_date, end_date) 복합 인덱스라 start_date를 걸지 않는
-- 이 쿼리들에는 도움이 되지 않는다(리딩 컬럼이 아니면 인덱스를 탈 수 없음) — 실측
-- 확인. is_active를 리딩 컬럼으로 하는 복합 인덱스를 추가해, 등호 필터(is_active)로
-- 먼저 좁힌 뒤 end_date 범위 조건과 정렬까지 인덱스 하나로 처리되도록 한다.
create index if not exists idx_events_active_enddate on public.events (is_active, end_date);
