-- Task 9-6-10(2026-08-23): get_nearby_spaces_and_events에 p_item_type 파라미터를 추가한다.
-- /nearby 지도 화면(map-explorer.tsx)을 상시 공간(open_spaces) 전용으로 단일화하되, 이
-- RPC는 generate-notifications.ts(D-1 예약 마감 알림)에서도 그대로 호출한다 — 그쪽은
-- item_type='EVENT'만 걸러서 쓰므로 이벤트 조회 자체를 없애면 알림 기능이 깨진다. 그래서
-- RPC 자체를 spaces-only로 바꾸지 않고, 호출부가 원하는 item_type만 선택적으로 받도록
-- 파라미터를 추가한다(기본값 null = 기존과 동일하게 둘 다 반환, 하위 호환 유지).
-- 함께 source_type(open_spaces 컬럼)도 반환에 추가한다 — /nearby의 새 상시 공간 목적별
-- 카테고리 칩(theme-spots.ts classifyThemeSpot)이 source_type 기반 확정 분류를 쓸 수 있도록.
--
-- 실측(2026-08-23): PostgreSQL은 파라미터 개수가 다른 CREATE OR REPLACE를 "교체"가 아니라
-- 별도 오버로드로 만들어, PostgREST가 3-인자 호출을 두 함수 중 무엇으로 볼지 못 정해
-- PGRST203("Could not choose the best candidate function") 에러가 났다. 기존 3-인자
-- 시그니처를 명시적으로 DROP한 뒤에야 새 4-인자 버전만 남는다.
drop function if exists public.get_nearby_spaces_and_events(double precision, double precision, int);

create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters int default 3000,
  p_item_type text default null
)
returns table (
  id uuid, name varchar, category varchar, distance_meters float, item_type varchar,
  lng double precision, lat double precision, address text, thumbnail_url text,
  start_date date, end_date date, reservation_start_date timestamptz,
  reservation_end_date timestamptz, reservation_url text, is_reservation_required boolean,
  operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean,
  has_parking boolean, stroller_accessible boolean, facility_type varchar,
  target_age_group varchar, booking_status varchar, source_type varchar
) as $$
begin
  return query
  select * from (
    select s.id, s.name, s.category,
      st_distance(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
      'SPACE'::varchar as item_type,
      st_x(s.location) as lng, st_y(s.location) as lat, s.address,
      null::text as thumbnail_url, null::date as start_date, null::date as end_date,
      null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
      null::text as reservation_url, null::boolean as is_reservation_required,
      s.operating_hours, s.is_free, s.info_url,
      s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
      null::varchar as booking_status, s.source_type
    from public.open_spaces s
    where (p_item_type is null or p_item_type = 'SPACE')
      and st_dwithin(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
    union all
    select e.id, e.title as name, e.event_type as category,
      st_distance(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
      'EVENT'::varchar as item_type,
      st_x(e.location) as lng, st_y(e.location) as lat,
      null::text as address, e.thumbnail_url, e.start_date, e.end_date,
      e.reservation_start_date, e.reservation_end_date, e.reservation_url, e.is_reservation_required,
      null::text as operating_hours, e.is_free, null::text as info_url,
      e.is_kids_friendly, e.has_parking, e.stroller_accessible, e.facility_type, e.target_age_group, e.booking_status,
      null::varchar as source_type
    from public.events e
    where (p_item_type is null or p_item_type = 'EVENT')
      and e.is_active = true
      and e.location_precision = 'EXACT'
      and st_dwithin(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  ) combined
  order by distance_meters
  limit 201;
end;
$$ language plpgsql stable;
