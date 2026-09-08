-- [장소 단위 대표 1건 노출](2026-09-09 사용자 지시): "8월 일반캠핑존 C형..
-- 장소기준으로는 난지캠핑장 하나 아니야?" → "장소 단위로 묶어서 대표 1건만
-- 노출하는 걸로 하자.. 다건에 대하여서는 클릭시 쫙 뜨는걸로 하자" — 관리자가
-- '중복 스팟 검토'로 여러 open_spaces 행을 같은 group_id로 묶으면(Step 77),
-- 소비자 화면(지도/검색)에는 그 그룹의 대표 1건만 보이고, 나머지는 클릭 시
-- get_spot_group_members로 펼쳐볼 수 있게 한다.
--
-- 대표 선정 기준: 그룹이 없는(group_id IS NULL) 행은 기존과 동일하게 자기 자신이
-- 곧 대표다(coalesce(group_id, id)로 묶음 키를 만들어 이 경우 그룹 크기가 항상
-- 1이 되므로 기존 동작을 그대로 보존한다). 그룹이 있는 행 중에서는:
--   - 반경 기반 조회(get_nearby_spaces_and_events)는 "사용자와 가장 가까운 멤버"를
--     대표로 삼는다(어차피 그룹 멤버들은 좌표가 사실상 같아 차이가 미미하지만,
--     이미 계산해둔 distance_meters를 그대로 재사용할 수 있어 자연스럽다).
--   - 반경 개념이 없는 전국 조회(get_spots_by_service_category)는 대표를 가릴
--     기준이 없어 "가장 먼저 적재된(created_at 오름차순)" 행을 쓴다 — 임의
--     기준이지만 결정적(deterministic)이라 결과가 매 호출마다 흔들리지 않는다.
--
-- 성능: DISTINCT ON 중복 제거는 이미 "반경/카테고리로 좁혀 최대 1,001건까지 자른
-- 뒤"에만 적용해(원본 100만 행 단위가 아니라 최대 1,001행 단위) 기존에 실측으로
-- 튜닝된 KNN/dwithin 쿼리 플랜에는 영향이 없다.

-- 1) get_nearby_spaces_and_events: group_id 컬럼 추가 + 그룹 대표만 반환.
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
  target_age_group varchar, booking_status varchar, source_type varchar, category_min text,
  group_id uuid
) as $$
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  if p_category_mins is null then
    return query
    select deduped.id, deduped.name, deduped.category, deduped.distance_meters, deduped.item_type,
      deduped.lng, deduped.lat, deduped.address, deduped.thumbnail_url, deduped.start_date, deduped.end_date,
      deduped.reservation_start_date, deduped.reservation_end_date, deduped.reservation_url,
      deduped.is_reservation_required, deduped.operating_hours, deduped.is_free, deduped.info_url,
      deduped.is_kids_friendly, deduped.has_parking, deduped.stroller_accessible, deduped.facility_type,
      deduped.target_age_group, deduped.booking_status, deduped.source_type, deduped.category_min, deduped.group_id
    from (
      select distinct on (coalesce(final_result.group_id, final_result.id)) final_result.*
      from (
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
              null::varchar as booking_status, s.source_type, s.category_min, s.group_id
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
        limit 1001
      ) final_result
      order by coalesce(final_result.group_id, final_result.id), final_result.distance_meters asc
    ) deduped
    order by deduped.distance_meters
    limit 1001;
  else
    return query
    select deduped.id, deduped.name, deduped.category, deduped.distance_meters, deduped.item_type,
      deduped.lng, deduped.lat, deduped.address, deduped.thumbnail_url, deduped.start_date, deduped.end_date,
      deduped.reservation_start_date, deduped.reservation_end_date, deduped.reservation_url,
      deduped.is_reservation_required, deduped.operating_hours, deduped.is_free, deduped.info_url,
      deduped.is_kids_friendly, deduped.has_parking, deduped.stroller_accessible, deduped.facility_type,
      deduped.target_age_group, deduped.booking_status, deduped.source_type, deduped.category_min, deduped.group_id
    from (
      select distinct on (coalesce(final_result.group_id, final_result.id)) final_result.*
      from (
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
            null::varchar as booking_status, s.source_type, s.category_min, s.group_id
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
            null::varchar as source_type, e.category_min, null::uuid as group_id
          from public.events e
          where (p_item_type is null or p_item_type = 'EVENT')
            and e.is_active = true
            and e.location_precision = 'EXACT'
            and e.category_min = any(p_category_mins)
            and st_dwithin(e.location::geography, user_point, radius_meters)
        ) final_result
        order by distance_meters
        limit 1001
      ) final_result
      order by coalesce(final_result.group_id, final_result.id), final_result.distance_meters asc
    ) deduped
    order by deduped.distance_meters
    limit 1001;
  end if;
end;
$$ language plpgsql stable;

-- 2) get_spots_by_service_category: group_id 컬럼 추가 + 그룹 대표(가장 먼저
-- 적재된 행)만 반환. 반경 개념이 없어 거리 대신 created_at으로 대표를 정한다.
create or replace function public.get_spots_by_service_category(
  p_service_category_id uuid
)
returns table (
  id uuid, name varchar, category varchar, distance_meters float, item_type varchar,
  lng double precision, lat double precision, address text, thumbnail_url text,
  start_date date, end_date date, reservation_start_date timestamptz,
  reservation_end_date timestamptz, reservation_url text, is_reservation_required boolean,
  operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean,
  has_parking boolean, stroller_accessible boolean, facility_type varchar,
  target_age_group varchar, booking_status varchar, source_type varchar, category_min text,
  group_id uuid
) as $$
begin
  return query
  select deduped.id, deduped.name, deduped.category, deduped.distance_meters, deduped.item_type,
    deduped.lng, deduped.lat, deduped.address, deduped.thumbnail_url, deduped.start_date, deduped.end_date,
    deduped.reservation_start_date, deduped.reservation_end_date, deduped.reservation_url,
    deduped.is_reservation_required, deduped.operating_hours, deduped.is_free, deduped.info_url,
    deduped.is_kids_friendly, deduped.has_parking, deduped.stroller_accessible, deduped.facility_type,
    deduped.target_age_group, deduped.booking_status, deduped.source_type, deduped.category_min, deduped.group_id
  from (
    select distinct on (coalesce(s.group_id, s.id))
      s.id, s.name, s.category,
      -1::float as distance_meters,
      'SPACE'::varchar as item_type,
      st_x(s.location) as lng, st_y(s.location) as lat, s.address,
      null::text as thumbnail_url, null::date as start_date, null::date as end_date,
      null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
      null::text as reservation_url, null::boolean as is_reservation_required,
      s.operating_hours, s.is_free, s.info_url,
      s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
      null::varchar as booking_status, s.source_type, s.category_min, s.group_id,
      s.created_at
    from public.open_spaces s
    where s.service_category_id = p_service_category_id
      and s.location_precision = 'EXACT'
    order by coalesce(s.group_id, s.id), s.created_at asc
  ) deduped;
end;
$$ language plpgsql stable;

-- 3) get_spot_group_members(신규): "이 장소의 다른 옵션 N건 더보기" 클릭 시 같은
-- group_id를 공유하는 전체 멤버를 가져온다(대표 포함 전부 — 소비자가 그중 원하는
-- 것을 골라 상세로 들어갈 수 있게).
create or replace function public.get_spot_group_members(
  p_group_id uuid
)
returns table (
  id uuid, name varchar, category varchar, distance_meters float, item_type varchar,
  lng double precision, lat double precision, address text, thumbnail_url text,
  start_date date, end_date date, reservation_start_date timestamptz,
  reservation_end_date timestamptz, reservation_url text, is_reservation_required boolean,
  operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean,
  has_parking boolean, stroller_accessible boolean, facility_type varchar,
  target_age_group varchar, booking_status varchar, source_type varchar, category_min text,
  group_id uuid
) as $$
  select s.id, s.name, s.category,
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
  where s.group_id = p_group_id
  order by s.created_at asc;
$$ language sql stable;
