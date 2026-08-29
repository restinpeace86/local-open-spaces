-- [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시)
--
-- 배경: 공식 홈페이지가 없는 스팟(신규 농어촌체험휴양마을/농촌교육농장 등 다수)에 대해,
-- 직전 작업에서 붙였던 "네이버 검색 딥링크" 폴백을 걷어내고, 대신 우리 플랫폼 자체
-- 간편 예약/신청 폼으로 흡수한다(외부로 유저를 내보내지 않고 우리 서비스 안에서 신청
-- 접수까지 완결).
--
-- 이 앱은 아직 로그인/세션 인증이 없다(known gap, category_rules 테이블과 동일한 상황 —
-- src/lib/supabase/admin.ts 주석 참고). reservations는 연락처 등 개인정보를 담으므로,
-- 기존 open_spaces/events(공개 조회 전용 데이터)보다 한 단계 더 보수적으로 다룬다 — RLS를
-- 켜두고 별도 정책을 추가하지 않아 익명 키(anon)로는 직접 조회/삽입이 전혀 안 되고, 오직
-- 서비스 롤 키(createAdminClient(), 서버 전용 API 라우트에서만 씀)로만 접근 가능하다.
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.open_spaces(id) on delete cascade,
  contact text not null,
  visit_date date not null,
  headcount integer not null check (headcount > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reservations_spot_id on public.reservations (spot_id);
create index if not exists idx_reservations_created_at on public.reservations (created_at desc);

alter table public.reservations enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — RLS가 켜진 상태에서 정책이 하나도 없으면
-- anon/authenticated 롤은 전부 차단되고 service_role만 통과한다(Supabase 기본 동작).
