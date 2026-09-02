-- [Decision 019](2026-09-02): 맘스픽 등급 배치(scripts/ingest/mom-pick-grade-batch.mjs)가
-- "이번 달(달력월) 누적 작성 건수 / 채택 건수"를 사용자별로 집계해야 하는데, supabase-js는
-- 임의 raw SQL 집계를 직접 보낼 수 없어 이 RPC로 감싼다. service_role 전용(SECURITY DEFINER,
-- RLS 우회 필요 — 배치는 전체 사용자를 대상으로 계산해야 하므로).
create or replace function public.get_monthly_mom_pick_activity()
returns table (author_id uuid, post_count bigint, adopted_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    author_id,
    count(*) as post_count,
    count(*) filter (where is_adopted) as adopted_count
  from public.mom_pick_posts
  where created_at >= date_trunc('month', now())
  group by author_id;
$$;

revoke all on function public.get_monthly_mom_pick_activity() from public, anon, authenticated;
grant execute on function public.get_monthly_mom_pick_activity() to service_role;
