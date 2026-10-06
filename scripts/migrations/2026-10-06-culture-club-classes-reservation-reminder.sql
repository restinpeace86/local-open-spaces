-- [예약 오픈 알림 일반화](project/decision-log.md Decision 028): event-
-- reservation-reminder-push-batch.mjs가 emart_culture_club_classes 대신
-- culture_club_classes(register_start_at)를 보도록 전환하기 위해 같은 의미의
-- "발송 완료 표시" 컬럼을 추가한다(events/emart_culture_club_classes와
-- 동일한 패턴 — 2026-09-20-event-reservation-open-reminder.sql 참고).
alter table public.culture_club_classes
  add column reservation_open_reminder_sent_at timestamptz;
