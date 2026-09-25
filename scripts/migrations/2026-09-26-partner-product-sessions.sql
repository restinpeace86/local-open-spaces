-- [상품별 시간 세팅 방식(자유/회차)](2026-09-25 사용자 지시): "지금 우리꺼는 시간은
-- 딱히 없는데 시간은 고객이 정하는거라는것처럼 되어있는데 이게 아니고 체험 시간도
-- 체험농장 사장님이 정하는거네" → "아니 우리도 그럼 자유롭게 할수있도록 하되 상품에
-- 대하여 시간도 세팅가능하게 하는건?" → "어 이 방식으로 구현들어가고". 상품마다
-- 시간을 어떻게 세팅할지가 다르다:
-- - free(자유): 지금처럼 예약 등록 시 사장님이 그때그때 날짜/시간을 직접 고른다.
-- - session(회차): 체험/클래스처럼 사장님이 상품을 만들 때 미리 회차(날짜/시간/정원)
--   를 정해두고, 예약은 그 회차 중 하나를 골라 정원 안에서만 잡힌다(네이버 예약의
--   체험 상품과 동일한 구조).
alter table public.partner_products
  add column if not exists time_mode text not null default 'free' check (time_mode in ('free', 'session'));

comment on column public.partner_products.time_mode is
  'free = 예약 등록 시 사장님이 날짜/시간을 자유 입력, session = 상품에 미리 등록된 회차(product_sessions) 중에서만 선택';

-- [회차/정원 관리] docs/partner_spec_v2_reservation_system.md 3.1/4.3절에서 이미
-- 설계해 둔 구조를 그대로 가져온다(제5장 제4조 기존 구조 우선) — 잔여 정원은 별도
-- 카운터 컬럼을 두지 않고 조회 시점에 capacity - 예약 합계로 계산한다(이 프로젝트가
-- 이미 aggregateBookingsByDay 등에서 쓰는 "집계는 조회 시점에 계산" 원칙과 동일).
create table if not exists public.product_sessions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.partner_products(id) on delete cascade,
  -- partners/bookings와 동일하게 partner_id를 비정규화해 RLS를 partner_products까지
  -- 조인하지 않고 바로 걸 수 있게 한다(제5장 제4조 기존 구조 우선).
  partner_id uuid not null references public.partners(id) on delete cascade,
  session_date date not null,
  start_time time not null,
  end_time time,
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_sessions_product_date on public.product_sessions (product_id, session_date);
create index if not exists idx_product_sessions_partner_date on public.product_sessions (partner_id, session_date);

alter table public.product_sessions enable row level security;

-- [기존 관례 재사용](제5장 제4조): partner_products와 동일한 RLS 패턴(auth.uid() = partner_id).
create policy "product_sessions_select_own" on public.product_sessions
  for select using (auth.uid() = partner_id);

create policy "product_sessions_insert_own" on public.product_sessions
  for insert with check (auth.uid() = partner_id);

create policy "product_sessions_update_own" on public.product_sessions
  for update using (auth.uid() = partner_id) with check (auth.uid() = partner_id);

create policy "product_sessions_delete_own" on public.product_sessions
  for delete using (auth.uid() = partner_id);

-- [예약 ↔ 회차 연결] session 모드 상품으로 예약이 들어오면 어떤 회차에 잡혔는지
-- 기록한다 — 회차가 삭제되면(사장님이 회차를 지운 경우) 예약 자체는 남기고 연결만
-- 끊는다(on delete set null, 예약 기록을 함부로 지우지 않는다는 기존 원칙과 동일).
-- 이 지시 범위는 회차 연결 자체까지만이라 age_breakdown/deposit_due_at 등
-- v2 스펙의 나머지 필드는 포함하지 않는다(별도로 논의된 범위 밖 항목).
alter table public.bookings
  add column if not exists session_id uuid references public.product_sessions(id) on delete set null;

create index if not exists idx_bookings_session on public.bookings (session_id) where session_id is not null;
