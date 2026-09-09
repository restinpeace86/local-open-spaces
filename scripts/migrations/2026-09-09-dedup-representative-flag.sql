-- [개선사항2](todo.md, 2026-09-09): "중복이 있는 스팟들은.. 병합을 수행하면
-- 대표 레코드 1개만 남고 나머지 중복 원천 데이터들은 그 아래로 흡수(소속)되어야
-- 합니다.. 관리자 검수/큐레이션 화면에서는 무조건 하나의 깔끔한 레코드로 노출..
-- 후속 큐레이션(스팟 정보, 블로그 뱃지 등)이 대표 레코드 기준으로 딱 한 번씩만
-- 수행될 수 있도록 데이터 구조가 연결돼야 합니다."
--
-- [설계] 지금까지(2026-09-09-group-representative-exposure.sql, Step 78)는
-- 소비자 RPC가 매 호출마다 "반경 조회는 최근접, 전국 조회는 최초 적재"라는
-- 서로 다른 기준으로 대표를 즉석 계산했다(distinct on + 정렬). 이 방식의
-- 문제: 소비자 화면(반경 조회)이 "가장 가까운 멤버"를 대표로 뽑는 반면,
-- 관리자가 큐레이션(블로그/가격 등)을 입력하는 대상은 그 계산과 무관한
-- 임의의 한 행이라 — 사용자 위치에 따라 소비자에게 노출되는 실제 물리적
-- 행이 매번 달라질 수 있고, 그러면 관리자가 공들여 큐레이션한 바로 그 행이
-- 아닌 다른 멤버가 노출되어 큐레이션이 소비자에게 전달되지 않는 경우가
-- 생길 수 있었다(개선사항2가 요구하는 "큐레이션은 대표 레코드 기준 한 번만"
-- 원칙과 정면으로 어긋남).
--
-- 이를 근본적으로 고치기 위해, "그룹당 대표가 어느 물리적 행인지"를 **그룹이
-- 확정되는 시점에 딱 한 번 결정해 컬럼에 고정**한다(open_spaces.
-- is_dedup_representative). 이후 모든 조회(소비자 RPC든 관리자 그리드든)는
-- 이 컬럼 하나만 보고 판단하므로 항상 동일한 물리적 행을 가리킨다 — 관리자가
-- 큐레이션한 행이 곧 소비자에게 노출되는 행임이 보장된다. 부수 효과로
-- distinct on 기반 즉석 계산보다 조회 자체도 더 싸다(단순 WHERE 필터).
--
-- 대표 선정 규칙: 그룹 확정 시점(apply) 기준 "가장 먼저 적재된(created_at
-- 오름차순) 멤버" — get_spots_by_service_category가 이미 쓰던 기준과
-- 동일하게 전체에 일원화한다(반경 조회의 "최근접" 기준은 폐기 — 사용자
-- 위치에 따라 달라져 대표가 불안정했던 것이 문제의 핵심이었으므로).
--
-- [개선사항2] "스팟픽>>마커 클릭>>표준상호명과 정보 그 하위에 예약 가능한
-- 리스트형태로 단계별 진입" — 대표로 반환되는 행의 name은 이제 원본
-- (raw_data 원문 이름, 예: "8월 일반캠핑존 D형(4인용, 자갈형)..") 대신
-- coalesce(standard_name, name)으로 관리자가 입력한 표준 시설명을 우선
-- 보여준다(표준명을 아직 안 정한 그룹/미그룹 행은 원본 name 그대로 폴백).
-- get_spot_group_members(펼쳐보기 목록)는 각 예약 옵션 고유의 원본 name을
-- 그대로 보여줘야 하므로 이 치환을 적용하지 않는다 — 이미 원하는 계층
-- ("대표=표준명" 위, "하위 목록=각자 원본명")과 정확히 일치한다.

-- 1) 컬럼 추가. 그룹 미소속 행(group_id IS NULL)에는 이 컬럼이 무의미해
-- 항상 true(기본값)로 둔다 — 조회 시 `group_id is null or is_dedup_
-- representative = true`로 짧게 평가되어 대다수 행(14만+ 건)에서는 이
-- 컬럼을 아예 보지 않는다.
alter table public.open_spaces
  add column if not exists is_dedup_representative boolean not null default true;

-- 2) 기존 264개 그룹(592건) 백필: 그룹별 최초 적재 멤버만 true, 나머지 false.
with ranked as (
  select id, group_id,
    row_number() over (partition by group_id order by created_at asc, id asc) as rn
  from public.open_spaces
  where group_id is not null
)
update public.open_spaces o
set is_dedup_representative = (r.rn = 1)
from ranked r
where o.id = r.id;

-- 3) auto_assign_open_spaces_to_existing_groups: 기존 그룹에 새로 편입되는
-- 행은 항상 대표가 아니다(그 그룹의 대표는 그룹 확정 시점에 이미 고정됨 —
-- 이 함수는 anchors CTE로 대표 행 자체를 조회 대상에서 건드리지 않으므로
-- 기존 대표를 실수로 false로 덮어쓸 위험이 없다).
create or replace function public.auto_assign_open_spaces_to_existing_groups()
returns integer
language plpgsql
as $$
declare
  v_updated_count integer;
begin
  with anchors as (
    select distinct on (group_id)
      group_id, location, standard_name, service_category_id, blog_url, age_group, feature_tag
    from public.open_spaces
    where group_id is not null and location is not null
    order by group_id, created_at asc
  ),
  matches as (
    select distinct on (s.id)
      s.id, a.group_id, a.standard_name, a.service_category_id, a.blog_url, a.age_group, a.feature_tag
    from public.open_spaces s
    join anchors a
      on s.group_id is null
      and s.location is not null
      and st_dwithin(s.location::geography, a.location::geography, 30)
    order by s.id, st_distance(s.location::geography, a.location::geography) asc
  )
  update public.open_spaces s
  set
    group_id = m.group_id,
    standard_name = m.standard_name,
    service_category_id = m.service_category_id,
    blog_url = m.blog_url,
    age_group = m.age_group,
    feature_tag = m.feature_tag,
    is_dedup_representative = false
  from matches m
  where s.id = m.id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

-- 4) get_nearby_spaces_and_events: distinct on 계산 대신 is_dedup_representative
-- 필터로 단순화(성능도 더 낫고, 대표가 매번 흔들리지 않아 정확함).
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
    select * from (
      select combined.* from (
        select s.id, coalesce(s.standard_name, s.name) as name, s.category,
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
      select s.id, coalesce(s.standard_name, s.name) as name, s.category,
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
$$ language plpgsql stable;

-- 5) get_spots_by_service_category: 동일하게 단순화(기존에도 이미 created_at
-- 기준이었으므로 결과는 바뀌지 않는다 — 계산 방식만 컬럼 조회로 대체).
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
  select s.id, coalesce(s.standard_name, s.name) as name, s.category,
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
$$ language sql stable;
