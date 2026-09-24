-- [AI 추천은 노출 중분류 있는 스팟만](2026-09-25 사용자 지시): "AI 추천인가 그거
-- 누르면 노출중분류 없는것도 다나오는데.. 노출중분류 있는것만 나오게 해줘 어린이
-- 뭐 아파트 놀이터라던가 다 나오더라" — rankAiRecommendedSpots()가 지금은 레거시
-- 필드 category_min(약 130,490건이 채워져 있는, 아직 노출 중분류로 정리 안 된
-- 자유 텍스트)만 체크하고 있어, 진짜 노출 중분류(service_category_id, 실제로는
-- 8,198건만 매핑됨)와 무관하게 걸러졌다 — 실측 확인.
--
-- get_nearby_spaces_and_events(SPACE 대상, map-explorer.tsx의 기본 반경 조회가
-- 쓰는 5-인자 오버로드)의 반환 테이블에 없던 service_category_id를 새 trailing
-- 컬럼으로 추가한다. 2026-09-09-find-nearby-open-spaces-add-service-category.sql과
-- 동일한 전례(CREATE OR REPLACE로 반환 테이블 끝에 컬럼만 추가 — 기존 컬럼
-- 순서/타입은 그대로라 DROP FUNCTION 없이 안전하게 교체 가능, PostgreSQL이 허용).
-- EVENT 쪽(public.events)에는 이 컬럼 자체가 없어(실측 확인) null::uuid로 채운다.
--
-- 그 외 로직/기존 컬럼은 2026-09-11-fix-nearby-rpc-standard-name-type-mismatch.sql과
-- 완전히 동일하다(재적재 회귀 방지) — service_category_id 추가 한 줄씩만 다르다.
--
-- [실측 발견] CREATE OR REPLACE만으로는 실패한다 — Postgres가
-- "cannot change return type of existing function... Row type defined by
-- OUT parameters is different. HINT: Use DROP FUNCTION ... first"로 거부했다
-- (RETURNS TABLE 함수는 find_nearby_open_spaces의 jsonb 반환과 달리 트레일링
-- 컬럼 추가도 DROP 없이는 안 된다 — 추측이 아니라 실제 에러로 확인). 그래서
-- 이 함수만 DROP 후 CREATE로 재생성한다. 아래 두 번째 alter문의 5-인자 오버로드
-- 타겟이므로 3-인자 오버로드(get_nearby_spaces_and_events(double precision,
-- double precision, integer))는 건드리지 않는다.
drop function public.get_nearby_spaces_and_events(double precision, double precision, integer, text, text[]);

create function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters integer default 3000,
  p_item_type text default null,
  p_category_mins text[] default null
)
returns table(
  id uuid, name character varying, category character varying, distance_meters double precision,
  item_type character varying, lng double precision, lat double precision, address text,
  thumbnail_url text, start_date date, end_date date,
  reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone,
  reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean,
  info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean,
  facility_type character varying, target_age_group character varying, booking_status character varying,
  source_type character varying, category_min text, group_id uuid, service_category_id uuid
)
language plpgsql
stable
as $function$
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  if p_category_mins is null then
    return query
    select * from (
      select combined.* from (
        select s.id, coalesce(s.standard_name, s.name)::character varying as name, s.category,
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
      select s.id, coalesce(s.standard_name, s.name)::character varying as name, s.category,
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

alter function public.get_nearby_spaces_and_events(double precision, double precision, integer, text, text[])
  set plan_cache_mode = force_custom_plan;
