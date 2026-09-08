-- [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시): "8월 일반캠핑존
-- C형.. 8월 일반캠핑존 B형.. 8월 프리캠핑존.. 장소기준으로는 난지캠핑장 하나
-- 아니야?" — 실측 확인 결과 서울시 공공예약(seoul_public_reservation) 소스는
-- 예약 단위(SVCID)로 낱개 적재돼(Decision 017 설계 그대로) 한 장소에 최대 28건까지
-- 완전히 동일한 좌표로 겹칠 수 있다(예: 한강공원 난지캠핑장). 기존
-- find_nearby_open_spaces(2026-09-05, MobileCurationWorkbench의 "1단: 중복 장소
-- 검수 배너" 전용)는 pair-wise(스팟 1개 + 유사 스팟 1개) 병합을 염두에 두고
-- p_limit=5로 좁게 설계돼 있어, 이런 다건(N-way) 중복을 한 번에 다 보여주지
-- 못한다. 캠핑장에 국한하지 않고 일반적으로 쓸 수 있도록 기본 limit만 넉넉하게
-- 올린다(제3장 제4조 확장성 고려 — 특정 카테고리를 하드코딩하지 않음).
create or replace function public.find_nearby_open_spaces(
  p_spot_id uuid,
  p_radius_meters integer default 30,
  p_limit integer default 50
)
returns jsonb
language sql
stable
as $$
  with target as (
    select id, location
    from public.open_spaces
    where id = p_spot_id
  ),
  nearby as (
    select
      o.id,
      o.name,
      o.category,
      o.category_min,
      o.address,
      round(ST_Distance(o.location::geography, t.location::geography)::numeric) as distance_m
    from public.open_spaces o, target t
    where o.id <> t.id
      and t.location is not null
      and o.location is not null
      and ST_DWithin(o.location::geography, t.location::geography, p_radius_meters)
    order by ST_Distance(o.location::geography, t.location::geography)
    limit p_limit
  )
  select coalesce(jsonb_agg(to_jsonb(nearby)), '[]'::jsonb) from nearby;
$$;
