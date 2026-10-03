-- [Decision 027 — 열심맘을 평생 1회성 달성으로 변경](2026-10-03 사용자 지시): "우수맘
-- 빼고는 그냥 매월 안하고 한번만 횟수채워도 되는거 아니야?" — 실제로 5건(9월)을 쓴
-- 유저가 10월 1일부터 활동이 없다는 이유만으로 새싹맘까지 떨어지는 걸 겪고 나온 지적.
-- 새싹맘(첫 글 1회)은 이미 평생 1회성이었다(promote_to_sprout_on_first_post 트리거,
-- 2026-09-02) — 이번엔 열심맘도 같은 방식으로 "평생 누적 2건 작성" 1회성 이벤트로
-- 바꾼다. 우수맘/파워맘(월 5개 스팟 사진 리뷰)만 계속 매월 재평가한다.
--
-- CREATE OR REPLACE FUNCTION은 반환 컬럼 집합을 바꿀 수 없어(Postgres 제약) DROP 후
-- 재생성한다. 이번에 "월간" 집계와 "평생" 집계를 함께 반환하게 되면서 함수명이
-- get_monthly_...로는 더 안 맞아 get_mom_pick_activity_summary로 바꾼다(오늘만 벌써
-- 세 번째로 이 함수를 건드리는 거라 이번에 이름을 바로잡아 둔다).
drop function if exists public.get_monthly_mom_pick_activity();

create function public.get_mom_pick_activity_summary()
returns table (author_id uuid, lifetime_post_count bigint, post_count bigint, adopted_count bigint, spot_photo_review_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    author_id,
    count(*) as lifetime_post_count,
    count(*) filter (where created_at >= date_trunc('month', now())) as post_count,
    count(*) filter (where is_adopted) as adopted_count,
    count(distinct spot_id) filter (
      where spot_id is not null and photo_urls is not null and array_length(photo_urls, 1) > 0
        and created_at >= date_trunc('month', now())
    ) as spot_photo_review_count
  from public.mom_pick_posts
  group by author_id;
$$;

revoke all on function public.get_mom_pick_activity_summary() from public, anon, authenticated;
grant execute on function public.get_mom_pick_activity_summary() to service_role;

-- [즉시 승급 트리거](promote_to_sprout_on_first_post와 동일 패턴, 2026-09-02): 평생
-- 누적 글이 2건째 저장되는 순간 바로 열심맘으로 승급시킨다 — 다음 날 배치를 기다리지
-- 않는다. signed_up/sprout에서만 승급하고(이미 excellent/power면 건드리지 않음),
-- 한 번 승급되면 이 함수가 다시 강등시키는 일은 없다(강등 로직은 전부
-- mom-pick-grade-batch.mjs 쪽에 있고, 그 배치도 이제 active 밑으로는 안 내린다).
create or replace function public.promote_to_active_on_lifetime_second_post()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.mom_pick_posts where author_id = new.author_id;
  if v_count >= 2 then
    update public.profiles
    set grade = 'active', grade_updated_at = now()
    where id = new.author_id and grade in ('signed_up', 'sprout');
  end if;
  return new;
end;
$$;

drop trigger if exists promote_to_active_on_lifetime_second_post on public.mom_pick_posts;
create trigger promote_to_active_on_lifetime_second_post
  after insert on public.mom_pick_posts
  for each row execute function public.promote_to_active_on_lifetime_second_post();

-- [기존 데이터 백필] 이미 평생 누적 2건 이상인데 아직 sprout에 머물러 있는 유저를
-- 즉시 승급한다(이 정책이 생기기 전부터 활동해 온 사람들이 손해 보지 않도록).
update public.profiles p
set grade = 'active', grade_updated_at = now()
where p.grade in ('signed_up', 'sprout')
  and (select count(*) from public.mom_pick_posts mp where mp.author_id = p.id) >= 2;
