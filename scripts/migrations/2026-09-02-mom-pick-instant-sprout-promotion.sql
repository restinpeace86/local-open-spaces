-- [Decision 019](2026-09-02) 보강: 새싹맘 승급("첫 스팟 방문 후기 또는 체크리스트 1회
-- 작성")은 달력월 실적 집계가 아니라 평생 1회성 이벤트라, 매일 배치를 기다리지 않고
-- 첫 글이 저장되는 즉시 승급시킨다 — 그렇지 않으면 사용자가 방금 조건을 채웠는데도
-- 다음 날 배치 전까지 자신이 막 연 커뮤니티 피드를 못 보는 어색한 공백이 생긴다.
-- 열심맘/우수맘/파워맘으로의 승급·강등(당월 실적 기준)은 이 트리거의 영역이 아니고
-- 여전히 scripts/ingest/mom-pick-grade-batch.mjs가 매일 배치로 처리한다 — 이 트리거는
-- signed_up → sprout 단 한 방향, 단 한 번만 다룬다(그 이상의 등급은 이미 sprout보다
-- 높으므로 조건절에서 자연히 배제된다).
create or replace function public.promote_to_sprout_on_first_post()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set grade = 'sprout', grade_updated_at = now()
  where id = new.author_id and grade = 'signed_up';
  return new;
end;
$$;

drop trigger if exists promote_to_sprout_on_first_post on public.mom_pick_posts;
create trigger promote_to_sprout_on_first_post
  after insert on public.mom_pick_posts
  for each row execute function public.promote_to_sprout_on_first_post();
