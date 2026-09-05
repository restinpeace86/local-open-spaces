-- [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시) 1단: "중복 장소
-- 검수 배너 — 반경 내 유사 장소 안내." 기존 중복 탐지(find_spot_dedup_candidates)는
-- open_spaces 전체를 geohash 순으로 배치 스캔하는 무거운 도구라(spot-dedup-panel.tsx
-- 참고) 워크벤치가 "지금 열어본 스팟 하나"에 대해 즉시 답을 줘야 하는 이 화면에는
-- 맞지 않는다 — 대신 이 스팟의 좌표만 기준으로 가벼운 ST_DWithin 반경 조회를 새로
-- 추가한다. 임계값은 spot-dedup-grouping.ts의 PROXIMITY_THRESHOLD_METERS(30m,
-- "동일 스팟으로 볼" 실제 거리 임계값)와 동일하게 맞춘다. location 컬럼에는 이미
-- GIST 공간 인덱스가 있어(2026-08-29-add-geography-spatial-indexes.sql) 단건 반경
-- 조회는 가볍다.
create or replace function public.find_nearby_open_spaces(
  p_spot_id uuid,
  p_radius_meters integer default 30,
  p_limit integer default 5
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
