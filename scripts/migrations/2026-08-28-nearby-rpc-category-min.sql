-- [스팟픽 대분류/중분류 계층적 탐색](2026-08-28): get_nearby_spaces_and_events RPC가
-- category_min을 조회해서 돌려주지 않아(실측 확인) /nearby(스팟픽) 화면이 대분류→중분류
-- 필터를 구현할 방법이 없었다. RETURNS TABLE에 category_min을 추가한다.
--
-- 이 함수의 이전 변경 이력이 여러 마이그레이션 파일에 흩어져 있어(2026-08-23-nearby-rpc-
-- item-type-and-source-type.sql: p_item_type 파라미터 + source_type 반환 추가,
-- 2026-08-23-nearby-rpc-exact-precision-only.sql / 2026-08-25-decision-017-null-safe-
-- source-schema.sql: open_spaces location_precision='EXACT' 필터 추가), 실측(라이브 RPC
-- 직접 호출)으로 현재 반영된 시그니처를 확인한 뒤(p_item_type/source_type 모두 살아있음을
-- 확인) 그 상태를 그대로 보존하면서 category_min만 추가한다 — 다른 동작은 전혀 바꾸지
-- 않는다. open_spaces에는 현재 location NOT NULL AND location_precision != 'EXACT'인
-- 행이 0건임을 실측 확인했지만(실질적 동작 차이 없음), Decision 009/017의 설계 의도를
-- 그대로 보존하기 위해 EXACT 필터는 유지한다.
--
-- events에는 category_maj 컬럼이 있지만 open_spaces에는 없다(이 프로젝트의 기존 구조 —
-- category_maj는 events 전용) — 두 브랜치 모두 category_min만 추가하고 category_maj는
-- 추가하지 않는다(대분류는 이번 작업에서 프론트엔드 전용 그룹핑으로 처리, DB 컬럼 불필요).
drop function if exists public.get_nearby_spaces_and_events(double precision, double precision, int, text);

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
begin
  return query
  select * from (
    select s.id, s.name, s.category,
      st_distance(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
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
      and st_dwithin(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
    union all
    select e.id, e.title as name, e.event_type as category,
      st_distance(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
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
      and st_dwithin(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  ) combined
  order by distance_meters
  limit 201;
end;
$$ language plpgsql stable;
