-- [긴급 버그 수정] get_nearby_spaces_and_events RPC 타입 불일치로 전체 스팟픽/홈
-- 피드가 깨져 있던 문제(2026-09-11 사용자 지시, implementation/todo.md 개선사항2):
-- "글쓰기 화면에서 장소를 검색할 때 'structure of query does not match function
-- result type' DB 에러가 화면에 그대로 노출된다."
--
-- [원인] 2026-09-09-dedup-representative-flag.sql(Step 82, "그룹 대표 노출")에서
-- SPACE 쪽 name 컬럼을 `coalesce(s.standard_name, s.name)`으로 바꿨는데,
-- `open_spaces.standard_name`은 text, `open_spaces.name`은 character varying이라
-- coalesce 결과 타입이 text로 굳어진다. 이 함수는 `language plpgsql`이고
-- `RETURN QUERY`를 쓰는데, PL/pgSQL의 RETURN QUERY는(순수 SQL 함수와 달리) 반환값을
-- RETURNS TABLE 선언 타입으로 암묵적으로 캐스팅해 주지 않는다 — RETURNS TABLE의
-- name은 character varying으로 선언돼 있어 실제 text 결과와 충돌, 매 호출마다
-- "structure of query does not match function result type" 에러가 났다.
-- 이 RPC는 스팟픽 기본 반경 지도(getNearbySpacesAndEvents)/홈 피드/맘스픽 인기
-- 스팟(popular-spots) 등 앱 전역이 공유하는 핵심 함수라, Step 82 이후 이 경로를
-- 쓰는 모든 화면이 실제로는 조회 실패 상태였을 것으로 추정된다(단위 테스트는
-- rpc를 mock해 이 문제를 잡아내지 못했다).
--
-- [수정] coalesce 결과를 ::character varying으로 명시 캐스팅해 선언 타입과 맞춘다.
-- 그 외 로직/시그니처는 기존과 완전히 동일하다(재적재 회귀 방지).
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
  thumbnail_url text, start_date date, end_date date,
  reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone,
  reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean,
  info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean,
  facility_type character varying, target_age_group character varying, booking_status character varying,
  source_type character varying, category_min text, group_id uuid
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
          null::varchar as booking_status, s.source_type, s.category_min, s.group_id
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
          null::varchar as source_type, e.category_min, null::uuid as group_id
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
        null::varchar as booking_status, s.source_type, s.category_min, s.group_id
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
        null::varchar as source_type, e.category_min, null::uuid as group_id
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
