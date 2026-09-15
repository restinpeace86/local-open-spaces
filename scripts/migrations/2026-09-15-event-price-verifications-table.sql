-- [이벤트/체험 스팟 다중 소스 가격 수집 및 관리자 검증 UI](2026-09-15 사용자 지시,
-- implementation/todo.md [개선사항 6]): 4개 소스(블로그/원천 설명/공식 홈페이지/정형
-- 요금 필드)에서 수집한 후보와 관리자가 최종 확정한 값을 함께 보관한다. candidates는
-- 수집 시점의 스냅샷(감사 목적) — 매번 새로 조회할 때마다 최신 후보로 다시 계산되며,
-- 이 컬럼은 "마지막으로 확정할 때 무엇을 보고 판단했는지" 기록용이다.
create table if not exists public.event_price_verifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  candidates jsonb not null default '[]'::jsonb,
  -- 무료/유료/변동 3분류. null = 아직 확정 안 함.
  final_price_type text check (final_price_type in ('free', 'paid', 'variable') or final_price_type is null),
  final_age_text text,
  final_price_text text,
  admin_note text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_price_verifications_event_id on public.event_price_verifications (event_id);

alter table public.event_price_verifications enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — spot_curations/curated_items/deals와
-- 동일 패턴(service_role(createAdminClient())만 접근, 관리자 API 라우트 전용).
