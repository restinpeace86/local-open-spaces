-- [예약 오픈 알림](2026-09-20 사용자 지시): "사전예약 오픈일에 맞추어 예약 오픈전
-- 10분전이라던가 앱 푸시 주는 기능" — 서울형키즈카페 등 예약 오픈 규칙이 자치구별로
-- 시차를 두고, 그 규칙 자체도 시기에 따라 바뀌는 것으로 확인돼(사용자가 2026-04/
-- 2026-09 두 시점의 서로 다른 공지문을 제시) 코드에 규칙을 하드코딩하지 않는다
-- (제3장 제5조 추측 금지). 대신 관리자가 이벤트마다 "다음 예약 오픈 시각"을 직접
-- 입력·관리한다.
alter table public.events
  add column if not exists next_reservation_open_at timestamptz,
  -- 발송 배치가 "이미 이 회차를 처리했는지" 판단하는 용도. next_reservation_open_at과
  -- 정확히 같은 값이면 이미 보낸 것 — 관리자가 다음 주 시각으로 갱신하면 값이 달라져
  -- 자연히 다시 발송 대상이 된다(별도 boolean 플래그 리셋 로직 불필요).
  add column if not exists reservation_open_reminder_sent_at timestamptz;

-- 로그인한 유저가 특정 이벤트의 "예약 오픈 임박 알림"을 신청한 기록. push_subscriptions
-- (기존 나드리픽 푸시가 쓰는 테이블, 기기별 구독 정보)와 분리한다 — 이건 "이 유저가
-- 이 이벤트를 구독했는가"라는 신청 여부만 담당하고, 실제 발송 시 push_subscriptions를
-- user_id로 조인해 그 유저의 모든 기기로 보낸다.
create table if not exists public.event_reservation_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists event_reservation_reminders_event_id_idx on public.event_reservation_reminders (event_id);

alter table public.event_reservation_reminders enable row level security;

-- [로그인만 하면 누구나 구독 가능](2026-09-20 사용자 확인): 우수맘 등급 제한 없음 —
-- 본인 행만 CRUD(user_bookmarks/push_subscriptions와 동일 관례).
create policy "event_reservation_reminders_select_own" on public.event_reservation_reminders
  for select using (auth.uid() = user_id);
create policy "event_reservation_reminders_insert_own" on public.event_reservation_reminders
  for insert with check (auth.uid() = user_id);
create policy "event_reservation_reminders_delete_own" on public.event_reservation_reminders
  for delete using (auth.uid() = user_id);
