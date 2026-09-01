-- [UI/UX 개선 및 기능 수정](2026-09-01 사용자 지시) 항목 5: "반경 내 시설이 너무
-- 많습니다" 트리거 임계값을 200건 → 1,000건으로 상향한다. 프론트엔드 MARKER_LIMIT
-- (map-explorer.tsx)만 바꾸면 RPC가 여전히 201건까지만 내려주므로, 이 RPC의 LIMIT도
-- 함께 1,001로 올려야 한다 — 기존 관례(마커 상한보다 하나 더 받아 "더 많은 결과가
-- 있다" 초과 안내를 클라이언트가 판단, 2026-08-28-nearby-rpc-category-min.sql)를 그대로
-- 유지한 채 숫자만 5배로 키운다. 함수 본문/시그니처/STABLE 선언 등 다른 동작은 전혀
-- 바꾸지 않는다(2026-08-28-nearby-rpc-category-min.sql에서 확정된 최신 버전 그대로
-- 복사한 뒤 마지막 limit 값만 수정).
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
  target_age_group varchar, booking_status varchar, source_type varchar, category_min text
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
      null::varchar as booking_status, s.source_type, s.category_min
    from public.open_spaces s
    where (p_item_type is null or p_item_type = 'SPACE')
      and s.location_precision = 'EXACT'
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
      null::varchar as source_type, e.category_min
    from public.events e
    where (p_item_type is null or p_item_type = 'EVENT')
      and e.is_active = true
      and e.location_precision = 'EXACT'
      and st_dwithin(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  ) combined
  order by distance_meters
  limit 1001;
end;
$$ language plpgsql stable;
