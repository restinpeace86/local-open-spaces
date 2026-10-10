-- [스팟픽 기본 화면도 노출중분류 매핑된 스팟만](2026-10-10 사용자 지적):
-- "스팟픽에 내가 계속 노출 중분류 있는 것만 나오고 노출중분류만
-- 보여야한다고 하지 않았어 ?" → 조사 후 "카테고리 선택했을 때만"으로
-- 잘못 설명 → 사용자가 정정: "아무 카테고리도 안고른 기본화면도
-- 노출중분류의 하나의 카테고리만 선택한게 아니라 노출중분류가 매핑된
-- 데이터들 중에서 반경내 전체 스팟을 보여주는거야."
--
-- [실측으로 발견한 성능 회귀 — 부분 인덱스로 해결] WHERE 조건에 service_
-- category_id is not null만 추가하고 인덱스 없이 배포했더니 EXPLAIN
-- (ANALYZE)로 4,449ms가 나왔다 — 기존 GiST 인덱스(idx_open_spaces_
-- location_geography)로 거리순(KNN) 스캔하면서 매핑 안 된 86%를 하나씩
-- 걸러내다 보니(매핑 비율 7.4%뿐이라 limit 1001을 채우려면 ~13,500건을
-- 훑어야 함) 느려졌다. service_category_id is not null 조건으로 걸러진
-- 부분 인덱스를 새로 만들어 KNN 스캔 자체가 매핑된 행만 훑게 하자 173ms로
-- 돌아왔다(25배 단축, 실측 재확인) — PostgREST(anon 롤)의 statement_
-- timeout에 실제로 걸려 500 에러가 나던 것도 이 인덱스로 해결됨을 라이브
-- REST 호출로 재확인했다.
create index if not exists idx_open_spaces_location_geography_mapped
  on public.open_spaces using gist (((location)::geography))
  where service_category_id is not null;

-- [실측으로 확인한 버그] get_nearby_spaces_and_events(p_category_mins가
-- null인 기본 화면 분기)의 SPACE 쿼리가 service_category_id를 전혀
-- 거르지 않아, 관리자가 노출중분류를 매핑하지 않은 스팟도 반경 내에
-- 있으면 그대로 지도에 찍혔다. 노출중분류를 특정 카테고리로 좁히는
-- 분기(p_category_mins가 있는 else 분기, getSpotsByServiceCategory/
-- getNearbyKidsRestaurants 등)는 원래부터 올바르게 동작하고 있었다 —
-- 이번엔 기본 화면 분기의 SPACE 쿼리에만 "service_category_id is not
-- null" 조건을 추가한다. EVENT 쪽은 이 개념이 없어(원래부터 service_
-- category_id가 항상 null로 반환됨) 건드리지 않는다.
create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters integer default 3000,
  p_item_type text default null,
  p_category_mins text[] default null
)
returns table(
  id uuid, name character varying, category character varying, distance_meters double precision,
  item_type character varying, lng double precision, lat double precision, address text,
  thumbnail_url text, start_date date, end_date date, reservation_start_date timestamptz,
  reservation_end_date timestamptz, reservation_url text, is_reservation_required boolean,
  operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean,
  stroller_accessible boolean, facility_type character varying, target_age_group character varying,
  booking_status character varying, source_type character varying, category_min text, group_id uuid,
  service_category_id uuid, excluded_weekdays text[], excluded_nth_weekdays text[]
)
language plpgsql
stable
set plan_cache_mode to 'force_custom_plan'
as $$
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  if p_category_mins is null then
    return query
    select * from (
      select combined.* from (
        select s.id, coalesce(s.display_name, s.standard_name, s.name)::character varying as name, s.category,
          st_distance(s.location::geography, user_point) as distance_meters,
          'SPACE'::varchar as item_type,
          st_x(s.location) as lng, st_y(s.location) as lat, s.address,
          null::text as thumbnail_url, null::date as start_date, null::date as end_date,
          null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
          null::text as reservation_url, null::boolean as is_reservation_required,
          s.operating_hours, s.is_free, s.info_url,
          s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
          null::varchar as booking_status, s.source_type, s.category_min, s.group_id, s.service_category_id,
          s.excluded_weekdays, s.excluded_nth_weekdays
        from public.open_spaces s
        where (p_item_type is null or p_item_type = 'SPACE')
          and s.location_precision = 'EXACT'
          and s.service_category_id is not null
          and (s.group_id is null or s.is_dedup_representative = true)
        order by s.location::geography <-> user_point
        limit 1001
      ) combined
      where combined.distance_meters <= radius_meters
      union all
      select combined.* from (
        select e.id, e.title as name, e.event_type as category,
          st_distance(e.location::geography, user_point) as distance_meters,
          'EVENT'::varchar as item_type,
          st_x(e.location) as lng, st_y(e.location) as lat,
          null::text as address, e.thumbnail_url, e.start_date, e.end_date,
          e.reservation_start_date, e.reservation_end_date, e.reservation_url, e.is_reservation_required,
          null::text as operating_hours, e.is_free, null::text as info_url,
          e.is_kids_friendly, e.has_parking, e.stroller_accessible, e.facility_type, e.target_age_group, e.booking_status,
          null::varchar as source_type, e.category_min, null::uuid as group_id, null::uuid as service_category_id,
          null::text[] as excluded_weekdays, null::text[] as excluded_nth_weekdays
        from public.events e
        where (p_item_type is null or p_item_type = 'EVENT')
          and e.is_active = true
          and e.location_precision = 'EXACT'
        order by e.location::geography <-> user_point
        limit 1001
      ) combined
      where combined.distance_meters <= radius_meters
    ) final_result
    order by distance_meters
    limit 1001;
  else
    return query
    select s.id, coalesce(s.display_name, s.standard_name, s.name)::character varying as name, s.category,
      st_distance(s.location::geography, user_point) as distance_meters,
      'SPACE'::varchar as item_type,
      st_x(s.location) as lng, st_y(s.location) as lat, s.address,
      null::text as thumbnail_url, null::date as start_date, null::date as end_date,
      null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
      null::text as reservation_url, null::boolean as is_reservation_required,
      s.operating_hours, s.is_free, s.info_url,
      s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
      null::varchar as booking_status, s.source_type, s.category_min, s.group_id, s.service_category_id,
      s.excluded_weekdays, s.excluded_nth_weekdays
    from public.open_spaces s
    where (p_item_type is null or p_item_type = 'SPACE')
      and s.location_precision = 'EXACT'
      and s.category_min = any(p_category_mins)
      and (s.group_id is null or s.is_dedup_representative = true)
      and st_dwithin(s.location::geography, user_point, radius_meters)
    union all
    select e.id, e.title as name, e.event_type as category,
      st_distance(e.location::geography, user_point) as distance_meters,
      'EVENT'::varchar as item_type,
      st_x(e.location) as lng, st_y(e.location) as lat,
      null::text as address, e.thumbnail_url, e.start_date, e.end_date,
      e.reservation_start_date, e.reservation_end_date, e.reservation_url, e.is_reservation_required,
      null::text as operating_hours, e.is_free, null::text as info_url,
      e.is_kids_friendly, e.has_parking, e.stroller_accessible, e.facility_type, e.target_age_group, e.booking_status,
      null::varchar as source_type, e.category_min, null::uuid as group_id, null::uuid as service_category_id,
      null::text[] as excluded_weekdays, null::text[] as excluded_nth_weekdays
    from public.events e
    where (p_item_type is null or p_item_type = 'EVENT')
      and e.is_active = true
      and e.location_precision = 'EXACT'
      and e.category_min = any(p_category_mins)
      and st_dwithin(e.location::geography, user_point, radius_meters)
    order by distance_meters
    limit 1001;
  end if;
end;
$$;
