-- [나드리픽 파트너 PMS Phase 1](2026-09-20 사용자 지시, docs/partner_spec.md): 공급자
-- (농장 사장님) 전용 스마트 장부 시스템의 핵심 테이블 3개 + RLS. 문서 하단에 첨부된
-- "[Task Prompt] Supabase DB 스키마 및 RLS 보안 설정 구현"의 컬럼/제약 정의를 그대로
-- 따른다 — 이 시점에는 슈퍼어드민 예외 정책(spec.md 9절)은 포함하지 않는다. 그 부분은
-- "본사 운영진 계정을 어떻게 식별할지"가 아직 확정되지 않은 상태라 임의로 테이블/정책을
-- 만들지 않고(추측 금지) HQ 대시보드 기능을 실제로 붙이는 다음 단계에서 별도 스펙으로
-- 다룬다.
--
-- [기존 관례 재사용] public.profiles(2026-09-02-create-profiles-table.sql)와 동일하게
-- "id references auth.users on delete cascade"로 Supabase Auth 사용자와 1:1 연동한다.
-- 파트너는 나드리픽 일반 유저(profiles)와 완전히 별도 테이블이라 데이터가 섞이지 않는다
-- (같은 auth.users 풀을 공유하는 것은 Supabase Auth의 기본 동작이라 문제 없음 — 한
-- 사람이 소비자 계정과 파트너 계정을 같은 소셜 로그인으로 갖는 것 자체는 정상이고, 이번
-- 요구사항의 "데이터가 섞이면 안 된다"는 프로필/게이미피케이션 데이터와 파트너 장부
-- 데이터가 같은 테이블에 뒤섞이면 안 된다는 뜻으로 해석했다 — 애초에 테이블이 분리돼
-- 있어 이 조건은 자동으로 만족된다).
create table if not exists public.partners (
  id uuid primary key references auth.users(id) on delete cascade,
  farm_name text not null,
  owner_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;

create policy "partners_select_own" on public.partners
  for select using (auth.uid() = id);

-- 최초 온보딩(상호명/사장님 성함/연락처 입력) 시 본인 행을 스스로 생성한다 — Phase 1은
-- 로그인/미들웨어 뼈대까지만이라 온보딩 폼 자체는 다음 단계에서 붙이지만, RLS는
-- 지금 미리 갖춰 둔다.
create policy "partners_insert_own" on public.partners
  for insert with check (auth.uid() = id);

create policy "partners_update_own" on public.partners
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- [통합 마스터 캘린더] 네이버 예약/나드리픽 직계약 예약을 함께 담는다(spec.md 6절).
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  booking_date date not null,
  booking_time time not null,
  headcount integer not null default 1,
  source text not null check (source in ('naver', 'nadripik')),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'noshow', 'completed')),
  memo text,
  created_at timestamptz not null default now()
);

-- 일간/주간/월간 뷰 모두 "이 파트너의 특정 날짜(구간)" 조회가 핵심 패턴이라
-- (partner_id, booking_date) 복합 인덱스가 가장 효과적이다(spec.md 지정).
create index if not exists idx_bookings_partner_date on public.bookings (partner_id, booking_date);

alter table public.bookings enable row level security;

create policy "bookings_select_own" on public.bookings
  for select using (auth.uid() = partner_id);

create policy "bookings_insert_own" on public.bookings
  for insert with check (auth.uid() = partner_id);

create policy "bookings_update_own" on public.bookings
  for update using (auth.uid() = partner_id) with check (auth.uid() = partner_id);

create policy "bookings_delete_own" on public.bookings
  for delete using (auth.uid() = partner_id);

-- [노쇼 방지 리마인드 설정] partner당 1행(1:1) — primary key 자체를 partner_id로 둔다.
create table if not exists public.partner_settings (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  reminder_template text,
  auto_reminder_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.partner_settings enable row level security;

create policy "partner_settings_select_own" on public.partner_settings
  for select using (auth.uid() = partner_id);

create policy "partner_settings_insert_own" on public.partner_settings
  for insert with check (auth.uid() = partner_id);

create policy "partner_settings_update_own" on public.partner_settings
  for update using (auth.uid() = partner_id) with check (auth.uid() = partner_id);
