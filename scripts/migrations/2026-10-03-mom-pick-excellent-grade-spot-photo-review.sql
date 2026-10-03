-- [Decision 019 개정 — 우수맘 달성 조건 변경](2026-10-03 사용자 지시): "월 5개 스팟
-- 리뷰(이미지 포함)인거야.. 관리자 수동승인 변경까진 모르겠네 일단 냅둬..." — 자동
-- 배치 재계산(Decision 019 5항)은 그대로 유지하고, 우수맘 판정 기준만 "월 5회 글쓰기
-- (글 형태 무관)" → "월 5개 '스팟'에 대한, 사진이 포함된 리뷰"로 바꾼다. 관리자 수동
-- 검수(원 지시 2항)는 사용자가 "모르겠다"며 보류했으므로 이번 범위에 포함하지 않는다
-- (implementation/todo.md [개선사항 3] 스킵 기록 중 이 부분만 해제, 수동검수 부분은
-- 계속 보류 — 별도 지시 필요).
--
-- "5개 스팟"은 건수가 아니라 서로 다른 지점 수를 뜻한다(동일 스팟을 여러 번 리뷰해도
-- 1개로만 집계 — 몰아쓰기로 쉽게 채우지 못하게). photo_urls는 survey_review 작성
-- 플로우에서만 쓰이는 컬럼(2026-09-04 추가)이라 post_type을 별도로 거를 필요 없이
-- "spot_id가 있고 photo_urls에 값이 있는" 행만 자연히 해당된다(체크리스트처럼
-- spot_id가 null인 글은 애초에 제외).
--
-- CREATE OR REPLACE FUNCTION은 반환 컬럼 집합을 바꿀 수 없어(Postgres 제약) DROP 후
-- 재생성한다.
drop function if exists public.get_monthly_mom_pick_activity();

create function public.get_monthly_mom_pick_activity()
returns table (author_id uuid, post_count bigint, adopted_count bigint, spot_photo_review_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    author_id,
    count(*) as post_count,
    count(*) filter (where is_adopted) as adopted_count,
    count(distinct spot_id) filter (
      where spot_id is not null and photo_urls is not null and array_length(photo_urls, 1) > 0
    ) as spot_photo_review_count
  from public.mom_pick_posts
  where created_at >= date_trunc('month', now())
  group by author_id;
$$;

revoke all on function public.get_monthly_mom_pick_activity() from public, anon, authenticated;
grant execute on function public.get_monthly_mom_pick_activity() to service_role;
