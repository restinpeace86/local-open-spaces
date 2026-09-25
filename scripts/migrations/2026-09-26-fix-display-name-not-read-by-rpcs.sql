-- [노출 이름 수동 수정이 화면에 반영 안 되는 버그 수정](2026-09-26 사용자 제보:
-- "노출 이름 수동 수정(원본 상호명: 소원.1) 여기에 지금 소원.1 태전직영점 이렇게
-- 적혀있어.. 이게 지금 화면에 노출이 안되고 있다는거야") — 2026-09-20에
-- open_spaces.display_name(관리자가 수동 지정하는 노출용 이름) 컬럼을 추가했지만,
-- 실측 확인 결과 유저 화면에 스팟 이름을 내려주는 RPC들이 이 컬럼을 전혀 읽지
-- 않고 있었다:
--   - get_nearby_spaces_and_events(5-인자, map-explorer.tsx가 쓰는 실제 경로)와
--     get_spots_by_service_category, get_deal_spots는 coalesce(standard_name,
--     name)만 써서 display_name을 아예 무시했다.
--   - get_nearby_spaces_and_events(3-인자, 레거시)는 coalesce(display_name, name)만
--     써서 standard_name을 무시했다(display_name 자체는 반영하고 있었으나 혼자만
--     다른 규칙).
-- 그 결과 관리자가 "노출 이름 수동 수정"으로 저장한 값(예: "소원.1" → "소원.1
-- 태전직영점")은 DB에는 정상 저장되지만(직접 조회로 확인) 2026-09-20 이후 한 번도
-- 실제 화면에 반영된 적이 없었다.
--
-- 세 우선순위를 하나로 통일한다: coalesce(display_name, standard_name, name).
-- display_name(관리자가 이 스팟 하나를 콕 집어 수동 수정한 값)이 가장 구체적인
-- 의도라 최우선, standard_name(중복 스팟 병합 시 대표로 고른 표준명)이 그다음,
-- 원본 name이 최종 폴백이다. 반환 컬럼/타입/그 외 로직은 전혀 바꾸지 않는다
-- (컬럼 추가가 아니라 name 계산식만 바꾸는 것이라 DROP 없이 CREATE OR REPLACE로
-- 안전하게 적용된다).

-- 1) get_nearby_spaces_and_events(3-인자, 레거시 오버로드)
create or replace function public.get_nearby_spaces_and_events(user_lng double precision, user_lat double precision, radius_meters integer default 3000)
 returns table(id uuid, name character varying, category character varying, distance_meters double precision, item_type character varying, lng double precision, lat double precision, address text, thumbnail_url text, start_date date, end_date date, reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone, reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean, facility_type character varying, target_age_group character varying, booking_status character varying)
 language plpgsql
 stable
 set plan_cache_mode to 'force_custom_plan'
as $function$
begin
  return query
  select * from (
    select
      s.id,
      coalesce(s.display_name, s.standard_name, s.name) as name,
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
$function$;

-- 2) get_nearby_spaces_and_events(5-인자, map-explorer.tsx가 실제로 쓰는 오버로드)
create or replace function public.get_nearby_spaces_and_events(user_lng double precision, user_lat double precision, radius_meters integer default 3000, p_item_type text default null::text, p_category_mins text[] default null::text[])
 returns table(id uuid, name character varying, category character varying, distance_meters double precision, item_type character varying, lng double precision, lat double precision, address text, thumbnail_url text, start_date date, end_date date, reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone, reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean, facility_type character varying, target_age_group character varying, booking_status character varying, source_type character varying, category_min text, group_id uuid, service_category_id uuid)
 language plpgsql
 stable
 set plan_cache_mode to 'force_custom_plan'
as $function$
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
          null::varchar as booking_status, s.source_type, s.category_min, s.group_id, s.service_category_id
        from public.open_spaces s
        where (p_item_type is null or p_item_type = 'SPACE')
          and s.location_precision = 'EXACT'
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
          null::varchar as source_type, e.category_min, null::uuid as group_id, null::uuid as service_category_id
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
    select * from (
      select s.id, coalesce(s.display_name, s.standard_name, s.name)::character varying as name, s.category,
        st_distance(s.location::geography, user_point) as distance_meters,
        'SPACE'::varchar as item_type,
        st_x(s.location) as lng, st_y(s.location) as lat, s.address,
        null::text as thumbnail_url, null::date as start_date, null::date as end_date,
        null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
        null::text as reservation_url, null::boolean as is_reservation_required,
        s.operating_hours, s.is_free, s.info_url,
        s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
        null::varchar as booking_status, s.source_type, s.category_min, s.group_id, s.service_category_id
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
        null::varchar as source_type, e.category_min, null::uuid as group_id, null::uuid as service_category_id
      from public.events e
      where (p_item_type is null or p_item_type = 'EVENT')
        and e.is_active = true
        and e.location_precision = 'EXACT'
        and e.category_min = any(p_category_mins)
        and st_dwithin(e.location::geography, user_point, radius_meters)
    ) final_result
    order by distance_meters
    limit 1001;
  end if;
end;
$function$;

-- 3) get_spots_by_service_category
create or replace function public.get_spots_by_service_category(p_service_category_id uuid)
 returns table(id uuid, name character varying, category character varying, distance_meters double precision, item_type character varying, lng double precision, lat double precision, address text, thumbnail_url text, start_date date, end_date date, reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone, reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean, facility_type character varying, target_age_group character varying, booking_status character varying, source_type character varying, category_min text, group_id uuid)
 language sql
 stable
as $function$
  select s.id, coalesce(s.display_name, s.standard_name, s.name) as name, s.category,
    -1::float as distance_meters,
    'SPACE'::varchar as item_type,
    st_x(s.location) as lng, st_y(s.location) as lat, s.address,
    null::text as thumbnail_url, null::date as start_date, null::date as end_date,
    null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
    null::text as reservation_url, null::boolean as is_reservation_required,
    s.operating_hours, s.is_free, s.info_url,
    s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
    null::varchar as booking_status, s.source_type, s.category_min, s.group_id
  from public.open_spaces s
  where s.service_category_id = p_service_category_id
    and s.location_precision = 'EXACT'
    and (s.group_id is null or s.is_dedup_representative = true)
  order by s.id
$function$;

-- 4) get_deal_spots
create or replace function public.get_deal_spots()
 returns table(id uuid, name character varying, category character varying, distance_meters double precision, item_type character varying, lng double precision, lat double precision, address text, thumbnail_url text, start_date date, end_date date, reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone, reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean, facility_type character varying, target_age_group character varying, booking_status character varying, source_type character varying, category_min text, group_id uuid)
 language sql
 stable
as $function$
  select s.id, coalesce(s.display_name, s.standard_name, s.name) as name, s.category,
    -1::float as distance_meters,
    'SPACE'::varchar as item_type,
    st_x(s.location) as lng, st_y(s.location) as lat, s.address,
    null::text as thumbnail_url, null::date as start_date, null::date as end_date,
    null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
    null::text as reservation_url, null::boolean as is_reservation_required,
    s.operating_hours, s.is_free, s.info_url,
    s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
    null::varchar as booking_status, s.source_type, s.category_min, s.group_id
  from public.open_spaces s
  where s.location_precision = 'EXACT'
    and (s.group_id is null or s.is_dedup_representative = true)
    and exists (
      select 1 from public.curated_items ci
      where ci.spot_id = s.id
        and ci.is_active = true
        and (ci.operation_start_date is null or ci.operation_start_date <= current_date)
        and (ci.operation_end_date is null or ci.operation_end_date >= current_date)
    )
$function$;
