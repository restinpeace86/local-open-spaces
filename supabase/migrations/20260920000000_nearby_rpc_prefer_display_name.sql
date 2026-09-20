-- [OPEN_SPACES 노출 이름 수동 수정](2026-09-20 사용자 지시): open_spaces.display_name
-- (관리자 수동 override)이 있으면 그것을, 없으면 기존 name을 반환한다. 반환 컬럼
-- 모양은 그대로라 create or replace만으로 충분하다(drop 불필요).
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
  info_url text,
  is_kids_friendly boolean,
  has_parking boolean,
  stroller_accessible boolean,
  facility_type varchar,
  target_age_group varchar,
  booking_status varchar
) as $$
begin
  return query
  select * from (
    select
      s.id,
      coalesce(s.display_name, s.name) as name,
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
      s.info_url,
      s.is_kids_friendly,
      s.has_parking,
      s.stroller_accessible,
      s.facility_type,
      s.target_age_group,
      null::varchar as booking_status
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
      e.is_free,
      null::text as info_url,
      e.is_kids_friendly,
      e.has_parking,
      e.stroller_accessible,
      e.facility_type,
      e.target_age_group,
      e.booking_status
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
