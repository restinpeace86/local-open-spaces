-- [예약 오픈 알림 발송 배치 안정화](2026-09-20 사용자 지시 후속): 발송 배치
-- (scripts/ingest/event-reservation-reminder-push-batch.mjs)가 10분마다
-- next_reservation_open_at 범위로 events(28,948건+)를 조회하는데, 인덱스가 없어
-- 실측으로 statement timeout이 발생했다. 대부분의 행이 이 컬럼이 null이므로
-- (관리자가 개별 이벤트에 수동 입력한 소수만 값이 있음) 부분 인덱스로 충분하다.
create index if not exists idx_events_next_reservation_open_at
  on public.events (next_reservation_open_at)
  where next_reservation_open_at is not null;
