-- [챗봇 문제점 수정](2026-09-02 사용자 지시): AI 챗봇 최종 검색이 반경 15km/40km("차로
-- 30분 이내"/"1시간 이상" — 경기도 거주자가 넓게 찾아보려 할 때 정확히 쓰는 값)에서
-- 매번 "canceling statement due to statement timeout"으로 실패하는 것을 실측으로
-- 재현·확인했다(curl로 재현, EXPLAIN ANALYZE로 원인 확인: 15km 반경에서 6.8초 소요 —
-- 오늘 이미 한 번 겪은 get_nearest_spot_weather와 완전히 동일한 근본 원인).
--
-- 원인: get_nearby_spaces_and_events(2026-08-28 도입, 2026-09-01 limit만 조정)가
-- st_dwithin(반경)으로 후보를 먼저 다 모은 뒤 st_distance로 정렬·limit 하는 방식이라,
-- 반경이 커질수록(스팟이 밀집한 수도권에서는 15km만 돼도 후보가 수만 건) 후보 수집
-- 자체가 느려진다.
--
-- 해결: PostGIS KNN 인덱스 연산자(`<->`)로 각 테이블에서 "전체 반경 무관, 그냥 가장
-- 가까운 1001건"을 먼저 빠르게 뽑고(기존 GiST 인덱스가 이미 있어 그대로 활용됨),
-- 그 결과에서만 실제 반경(radius_meters) 조건으로 사후 필터링한다. 수학적으로 동일한
-- 결과를 보장한다 — 반경 R 이내의 점은 전부 "거리가 R 이하"이므로, 정의상 무제한
-- 최근접 1001건 안에 반드시 포함된다(반경 이내 매치가 1001건을 초과하는 극단적 밀집
-- 상황이 아닌 한 — 기존에도 최종 limit이 1001이라 그 이상은 어차피 잘렸음, 동일 한계).
-- 함수 시그니처/반환 컬럼/동작 의미는 전혀 바뀌지 않는다 — 내부 실행 전략만 최적화.
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
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
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
end;
$$ language plpgsql stable;
