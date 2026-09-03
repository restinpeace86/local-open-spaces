-- [챗봇 카테고리 체계 동기화](2026-09-03 사용자 지시) 작업 중 실측으로 발견한 버그:
-- get_nearby_spaces_and_events는 category_min과 무관하게 "전체 중 가장 가까운 1001건"을
-- 먼저 뽑은 뒤(KNN 인덱스 워크, 2026-09-02 성능 수정) 그 안에서만 반경/타입 필터를
-- 적용한다. 서울 시청 좌표 기준 11km 안에만 open_spaces가 11,680건(어린이놀이터/공원 등
-- 흔한 카테고리가 대부분)이나 있어, 실제로는 10.78km 거리에 있는 "교육농장"(체험/농장
-- vibe)조차 이 1001건 안에 들지 못해 챗봇이 "조건에 맞는 곳을 찾지 못했다"고 잘못
-- 응답했다(실측 확인: FARM_EXPERIENCE vibe로 반경 40km 요청까지 해봐도 exhausted=true,
-- 그런데 실제로는 10.78km 거리에 매칭 데이터가 있었음). "반경 안에 매치가 있는데도 밀집
-- 지역에서는 못 찾는다"는 이번 KNN 최적화 자체가 전제했던 한계(주석 참고: "반경 이내
-- 매치가 1001건을 초과하는 극단적 밀집 상황이 아닌 한")가 실제로 발생한 사례다 — 다만
-- 문제는 "매치 자체가 1001건을 넘어서"가 아니라 "전혀 상관없는 카테고리가 1001자리를
-- 다 차지해서"이므로, 카테고리를 아는 호출부(챗봇)는 KNN 정렬 전에 category_min으로
-- 미리 좁혀 이 경쟁 자체를 없앨 수 있다. p_category_mins를 새 선택적 파라미터로 추가한다
-- (기본값 null = 기존과 완전히 동일한 동작, 다른 모든 호출부는 전혀 영향받지 않는다).
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
        and (p_category_mins is null or s.category_min = any(p_category_mins))
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
        and (p_category_mins is null or e.category_min = any(p_category_mins))
      order by e.location::geography <-> user_point
      limit 1001
    ) combined
    where combined.distance_meters <= radius_meters
  ) final_result
  order by distance_meters
  limit 1001;
end;
$$ language plpgsql stable;
