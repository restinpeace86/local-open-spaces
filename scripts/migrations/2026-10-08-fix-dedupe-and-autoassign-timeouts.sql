-- [DEDUPE_OPEN_SPACES / AUTO_ASSIGN_TO_EXISTING_GROUPS statement timeout 진단/수정]
-- (2026-10-08 사용자 지시: "이 2개는 매일 실패 반복해 얼마나 오래걸리는지
-- 왜 오래걸리는지 뭐가 문제인지 한번 확인해봐")
--
-- [DEDUPE_OPEN_SPACES 원인 — 실측 확인] open_spaces.id를 참조하는 FK 10개 중
-- events.space_id/partners.spot_id/user_bookmarks.spot_id 3개에만 인덱스가
-- 없었다. open_spaces에서 200건을 DELETE하는 실제 실행(EXPLAIN ANALYZE,
-- 롤백)으로 측정한 결과 총 80.4초 중 79.66초가 전부 events_space_id_fkey
-- 트리거(= events 테이블을 인덱스 없이 매 삭제 행마다 순차 스캔)에서
-- 소모됐다(다른 9개 FK 트리거는 전부 합쳐도 0.5초 미만). partners(4건)/
-- user_bookmarks(0건)는 지금은 작아서 문제가 안 되지만, 나머지 7개 참조
--테이블이 전부 인덱스를 갖고 있는 것과 일관되게 맞춰(향후 증가 대비) 함께
-- 추가한다.
create index if not exists idx_events_space_id on public.events (space_id);
create index if not exists idx_partners_spot_id on public.partners (spot_id);
create index if not exists idx_user_bookmarks_spot_id on public.user_bookmarks (spot_id);

-- [AUTO_ASSIGN_TO_EXISTING_GROUPS 원인 — 실측 확인] 신규 미그룹 행을 기존
-- 확정 그룹(anchor, 814개)에 30m 이내로 매칭하는 서브쿼리(matches CTE)의
-- DISTINCT ON 결과 행 수를 플래너가 실제값(264건)보다 약 400배 과대추정
-- (104,130건으로 추정) — 이 오추정 때문에 마지막 UPDATE...FROM이 Merge
-- Join을 선택해 open_spaces 전체(14만여 건)를 pkey 인덱스로 순서대로
-- 훑는 계획이 돼버린다(EXPLAIN ANALYZE 실측: 83.7초, 그 중 79초가 그 전체
-- 스캔). enable_mergejoin/enable_hashjoin을 이 함수 실행 범위에서만 끄면
-- 플래너가 Nested Loop(264건 × pkey 포인트룩업)를 선택해 3.8초로 끝난다
-- (동일 EXPLAIN ANALYZE로 재확인). PostGIS의 st_dwithin 선택도는 일반적으로
-- 과대추정되는 경향이 있어(알려진 플래너 한계) ANALYZE만으로는 해결되지
-- 않는다 — 이 함수가 다루는 "신규 미그룹 행이 기존 그룹 30m 이내에 있는
-- 경우"는 본질적으로 희소한 결과셋이라 Nested Loop 강제가 항상 더 유리하다.
create or replace function public.auto_assign_open_spaces_to_existing_groups()
returns integer
language plpgsql
as $function$
declare
  v_updated_count integer;
begin
  set local enable_mergejoin = off;
  set local enable_hashjoin = off;

  with anchors as (
    select distinct on (group_id)
      group_id, location, standard_name, service_category_id, blog_url, age_group, feature_tag
    from public.open_spaces
    where group_id is not null and location is not null
    order by group_id, created_at asc
  ),
  matches as (
    select distinct on (s.id)
      s.id, a.group_id, a.standard_name, a.service_category_id, a.blog_url, a.age_group, a.feature_tag
    from public.open_spaces s
    join anchors a
      on s.group_id is null
      and s.location is not null
      and st_dwithin(s.location::geography, a.location::geography, 30)
    order by s.id, st_distance(s.location::geography, a.location::geography) asc
  )
  update public.open_spaces s
  set
    group_id = m.group_id,
    standard_name = m.standard_name,
    service_category_id = m.service_category_id,
    blog_url = m.blog_url,
    age_group = m.age_group,
    feature_tag = m.feature_tag,
    is_dedup_representative = false
  from matches m
  where s.id = m.id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$function$;
