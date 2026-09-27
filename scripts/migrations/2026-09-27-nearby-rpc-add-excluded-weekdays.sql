-- [open_spaces 정기휴무 마커/리스트 표시](2026-09-27 사용자 지시): "이거 스팟픽에서
-- 보여줄때.. 정기휴무일은 마커도.. 회색으로 칠해주고.. 노출중분류 어린이 도서관
-- 눌렀을때... 오늘이 정기휴무하는 일자면 회색으로 띄우고" — 소비자 화면(지도/리스트)이
-- 읽는 RPC 2개(get_nearby_spaces_and_events 5-arg, get_spots_by_service_category)에
-- excluded_weekdays/excluded_nth_weekdays를 추가한다. 이 두 RPC는 TS .select()가
-- 아니라 SQL 함수 안에 컬럼 목록이 하드코딩돼 있어(실측: pg_get_functiondef로 현재
-- 배포된 정의 직접 확인), CREATE OR REPLACE로 그 목록에 추가하는 것 외에 다른 방법이
-- 없다. events 쪽(UNION ALL) 브랜치는 이 컬럼이 없으니 null::text[]로 맞춘다(컬럼
-- 개수/타입을 UNION 양쪽이 반드시 일치시켜야 함).
--
-- get_spot_group_members(다른 옵션 더보기)와 3-arg 구버전 오버로드는 이번 범위에서
-- 제외한다(사용 빈도가 낮은 보조 경로 — 필요하면 별도로 확장).

-- RETURNS TABLE 컬럼 목록(반환 타입)을 바꾸는 건 CREATE OR REPLACE로 안 되고
-- (Postgres 42P13: "cannot change return type of existing function"), 반드시
-- DROP 후 재생성해야 한다 — 실제 적용 시도로 확인함.
drop function if exists public.get_nearby_spaces_and_events(double precision, double precision, integer, text, text[]);
drop function if exists public.get_spots_by_service_category(uuid);

create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters integer default 3000,
  p_item_type text default null::text,
  p_category_mins text[] default null::text[]
)
returns table(
  id uuid, name character varying, category character varying, distance_meters double precision,
  item_type character varying, lng double precision, lat double precision, address text,
  thumbnail_url text, start_date date, end_date date,
  reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone,
  reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean,
  info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean,
  facility_type character varying, target_age_group character varying, booking_status character varying,
  source_type character varying, category_min text, group_id uuid, service_category_id uuid,
  excluded_weekdays text[], excluded_nth_weekdays text[]
)
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
          null::varchar as booking_status, s.source_type, s.category_min, s.group_id, s.service_category_id,
          s.excluded_weekdays, s.excluded_nth_weekdays
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
    ) final_result
    order by distance_meters
    limit 1001;
  end if;
end;
$function$;

create or replace function public.get_spots_by_service_category(p_service_category_id uuid)
returns table(
  id uuid, name character varying, category character varying, distance_meters double precision,
  item_type character varying, lng double precision, lat double precision, address text,
  thumbnail_url text, start_date date, end_date date,
  reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone,
  reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean,
  info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean,
  facility_type character varying, target_age_group character varying, booking_status character varying,
  source_type character varying, category_min text, group_id uuid,
  excluded_weekdays text[], excluded_nth_weekdays text[]
)
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
    null::varchar as booking_status, s.source_type, s.category_min, s.group_id,
    s.excluded_weekdays, s.excluded_nth_weekdays
  from public.open_spaces s
  where s.service_category_id = p_service_category_id
    and s.location_precision = 'EXACT'
    and (s.group_id is null or s.is_dedup_representative = true)
  order by s.id
$function$;
