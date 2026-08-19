-- spec/space/space-detail.md, spec/event/event-detail.md 구현을 위해
-- get_nearby_spaces_and_events RPC에 상세 모달 표시용 필드를 추가한다.
-- (운영시간/무료여부/외부링크/예약정보 등 — 상세 모달의 CTA/정보 영역에 필수)

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
  reservation_start_date timestamptz,
  reservation_end_date timestamptz,
  reservation_url text,
  is_reservation_required boolean,
  operating_hours text,
  is_free boolean,
  info_url text
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
      null::timestamptz as reservation_start_date,
      null::timestamptz as reservation_end_date,
      null::text as reservation_url,
      null::boolean as is_reservation_required,
      s.operating_hours,
      s.is_free,
      s.info_url
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
      e.reservation_start_date,
      e.reservation_end_date,
      e.reservation_url,
      e.is_reservation_required,
      null::text as operating_hours,
      null::boolean as is_free,
      null::text as info_url
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
