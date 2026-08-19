-- spec/map/kakao-map.md, spec/map/spatial-search.md 구현을 위해
-- get_nearby_spaces_and_events RPC를 확장한다.
-- 기존 함수(project/database_schema.md 4.1)는 id/name/category/distance_meters/item_type만
-- 반환해 지도 마커 렌더링에 필요한 좌표가 없었다. 마커 렌더링은 이미 승인된 지도 스펙의
-- 핵심 요구사항이므로, 좌표 및 카드 표시용 부가 필드를 추가하고 최대 반환 건수를 201건으로
-- 제한한다 (spec/map/spatial-search.md 3.1: 최대 200개 마커 우선 렌더링 + 초과 안내).

drop function if exists public.get_nearby_spaces_and_events(double precision, double precision, int);

create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters int default 3000
)
returns table (
  id uuid,
  name varchar,
  category varchar,
  distance_meters float,
  item_type varchar,
  lng double precision,
  lat double precision,
  address text,
  thumbnail_url text,
  start_date date,
  end_date date,
  reservation_end_date timestamptz
) as $$
begin
  return query
  select * from (
    select
      s.id,
      s.name,
      s.category,
      st_distance(
        s.location::geography,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
      ) as distance_meters,
      'SPACE'::varchar as item_type,
      st_x(s.location) as lng,
      st_y(s.location) as lat,
      s.address,
      null::text as thumbnail_url,
      null::date as start_date,
      null::date as end_date,
      null::timestamptz as reservation_end_date
    from public.open_spaces s
    where st_dwithin(
      s.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
    union all
    select
      e.id,
      e.title as name,
      e.event_type as category,
      st_distance(
        e.location::geography,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
      ) as distance_meters,
      'EVENT'::varchar as item_type,
      st_x(e.location) as lng,
      st_y(e.location) as lat,
      null::text as address,
      e.thumbnail_url,
      e.start_date,
      e.end_date,
      e.reservation_end_date
    from public.events e
    where e.is_active = true
      and st_dwithin(
        e.location::geography,
        st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
        radius_meters
      )
  ) combined
  order by distance_meters
  limit 201;
end;
$$ language plpgsql stable;
