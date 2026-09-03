-- [챗봇 카테고리 체계 동기화](2026-09-03) 3차 수정. 1차(-prefilter.sql, category_min =
-- any(...)를 KNN 정렬과 결합)와 2차(-v2.sql, 값마다 LATERAL KNN 반복)를 모두 실측으로
-- 검증했으나 둘 다 실패했다:
--   - 1차: NATURE_CAMPING(흔한 카테고리 다수 포함)에서 3.5초, 실제 PostgREST 경로로는
--     8초 타임아웃까지 발생(BitmapAnd 없이 KNN 인덱스만으로 정렬하며 category_min을
--     매 행마다 재확인해야 해서, 매칭 안 되는 후보를 대량으로 훑어야 했다).
--   - 2차: 값 하나로 좁혀도 그 값 자체가 흔하면(예: '공원' 25,531건) "그 값만의 최근접
--     1001건"을 찾는 KNN 워크 자체가 여전히 느렸고(4.5초), 값 개수만큼 반복해 오히려
--     14초로 더 느려졌다 — "단일 등치 조건이면 항상 빠르다"는 가정이 희귀 카테고리에서만
--     성립하고 흔한 카테고리에는 적용되지 않았다.
-- 3차: category_min이 정해져 있고 목표 반경(radius_meters)도 이미 알고 있는 상황에서는
-- KNN "무제한 최근접 워크" 대신 `st_dwithin`(반경 내 여부, geography GiST 인덱스의 &&
-- 연산으로 인덱스를 탄다) + category_min의 btree 인덱스를 BitmapAnd로 결합해 후보를
-- 먼저 좁힌 뒤에만 정렬한다 — 실측: 밀집 지역(서울시청) 기준 5km에서 76ms, 최악의
-- 경우(40km, 흔한 카테고리 5개 조합)에도 2.95초로 8초 타임아웃 안에 안전하게 들어온다.
-- p_category_mins가 null인 기존 호출부(지도 화면 등)는 이전 KNN 전용 경로를 그대로
-- 써 성능 회귀가 전혀 없다.
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
    -- [실측으로 검증된 카테고리 필터 경로] 반경(st_dwithin)과 표준 중분류(category_min)
    -- 두 인덱스를 BitmapAnd로 먼저 결합해 후보를 좁힌 뒤 정렬한다 — "최근접 N건"을
    -- 무제한으로 찾는 KNN 워크보다, "이미 아는 반경 안"이라는 제약이 있을 때 훨씬 빠르다.
    return query
    select * from (
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
        and s.category_min = any(p_category_mins)
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
        null::varchar as source_type, e.category_min
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
$$ language plpgsql stable;
