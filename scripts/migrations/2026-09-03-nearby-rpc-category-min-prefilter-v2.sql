-- [챗봇 카테고리 체계 동기화](2026-09-03) 1차 수정(-prefilter.sql)에서 실측으로 발견한
-- 회귀: `category_min = any(array[...])`를 KNN 정렬(`order by location <-> point`)과
-- 함께 걸면, 카테고리가 흔할수록(예: NATURE_CAMPING의 '공원' 25,531건) 1001건을 채울 때까지
-- 훨씬 더 많은 후보를 인덱스 순서로 훑어야 해서(실측: 8,307행 훑어 3.5초, PostgREST
-- 8초 타임아웃에 실제로 걸림) 오히려 더 느려졌다 — 반면 category_min 단일값 등치 조건은
-- KNN 인덱스와 결합해도 항상 빨랐다(이번 세션에 반복 실측: 60~330ms). 그래서 배열의
-- 각 값마다 "그 값 하나로 좁힌 KNN 스캔"을 LATERAL로 따로 돌려 UNION하는 방식으로
-- 바꾼다 — 값마다 빠른 단일 등치+KNN 경로를 그대로 활용하면서, 값 개수만큼만 쿼리가
-- 늘어난다(챗봇 vibe는 최대 10개 내외라 부담 없음). p_category_mins가 null이면(대부분의
-- 다른 호출부) 기존 "전체 대상 KNN limit 1001" 경로를 그대로 유지해 성능 회귀가 없다.
create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters int default 3000,
  p_item_type text default null,
  p_category_mins text[] default null
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
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  if p_category_mins is null then
    -- 기존 동작 그대로 — 이 분기는 2026-09-02 KNN 성능 수정본과 완전히 동일하다.
    return query
    select * from (
      select combined.* from (
        select s.id, s.name, s.category,
          st_distance(s.location::geography, user_point) as distance_meters,
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
          null::varchar as source_type, e.category_min
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
    -- [실측으로 발견한 성능 함정 대응] category_min 배열의 값마다 별도 KNN 스캔(LATERAL)을
    -- 돌려 UNION한다 — 값 하나로 좁힌 등치+KNN 조합은 항상 빨랐다(실측).
    return query
    select * from (
      select combined.* from (
        select s.id, s.name, s.category,
          st_distance(s.location::geography, user_point) as distance_meters,
          'SPACE'::varchar as item_type,
          st_x(s.location) as lng, st_y(s.location) as lat, s.address,
          null::text as thumbnail_url, null::date as start_date, null::date as end_date,
          null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
          null::text as reservation_url, null::boolean as is_reservation_required,
          s.operating_hours, s.is_free, s.info_url,
          s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
          null::varchar as booking_status, s.source_type, s.category_min
        from unnest(p_category_mins) as cm(value)
        cross join lateral (
          select *
          from public.open_spaces s
          where (p_item_type is null or p_item_type = 'SPACE')
            and s.location_precision = 'EXACT'
            and s.category_min = cm.value
          order by s.location::geography <-> user_point
          limit 1001
        ) s
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
          null::varchar as source_type, e.category_min
        from unnest(p_category_mins) as cm(value)
        cross join lateral (
          select *
          from public.events e
          where (p_item_type is null or p_item_type = 'EVENT')
            and e.is_active = true
            and e.location_precision = 'EXACT'
            and e.category_min = cm.value
          order by e.location::geography <-> user_point
          limit 1001
        ) e
      ) combined
      where combined.distance_meters <= radius_meters
    ) final_result
    order by distance_meters
    limit 1001;
  end if;
end;
$$ language plpgsql stable;
