-- [노출 중분류 기준 카테고리 필터 전면 교체 + 반경 컷오프 폐지](2026-09-08
-- 사용자 지시): "반경 컷오프 완전 폐지 + 도 전역 노출로 해줘(지도에 찍히는
-- 거 기준).. 현재 노출 중분류 기준으로 카테고리 필터 전면교체할것" — 노출
-- 중분류(service_category_id)로 선택된 중분류에 해당하는 전체 스팟을 반경
-- 제한 없이 전국 단위로 가져오는 신규 RPC. 기존 get_nearby_spaces_and_events
-- (KNN/st_dwithin 기반 반경 검색)와는 목적이 완전히 달라 별도 함수로 분리한다
-- (기존 함수를 건드리면 그 함수가 이미 실측으로 튜닝된 성능 특성을 회귀시킬
-- 위험이 있음).
--
-- 반경/거리 조건이 전혀 없는 단순 등치(service_category_id = ?) 조회라 공간
-- 인덱스(GiST)가 필요 없다 — service_category_id의 FK 인덱스만으로 충분히
-- 빠르다(실측: 최대 매핑 건수 카테고리인 "키즈카페 / 실내놀이터" 2,304건
-- 기준).
--
-- distance_meters는 고정된 기준점이 없어(전역 조회) 의미가 없다 — 클라이언트가
-- 실시간 GPS/설정 위치 기준으로 별도 계산해 덮어쓴다(map-explorer.tsx 참고).
-- -1은 기존 코드베이스에서 "거리 정보 없음"을 뜻하는 관례적인 sentinel 값이다
-- (예: get-home-feed.ts, detail-modal.tsx의 item.distance_meters >= 0 체크).
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
  target_age_group varchar, booking_status varchar, source_type varchar, category_min text
) as $$
begin
  return query
  select s.id, s.name, s.category,
    -1::float as distance_meters,
    'SPACE'::varchar as item_type,
    st_x(s.location) as lng, st_y(s.location) as lat, s.address,
    null::text as thumbnail_url, null::date as start_date, null::date as end_date,
    null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
    null::text as reservation_url, null::boolean as is_reservation_required,
    s.operating_hours, s.is_free, s.info_url,
    s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
    null::varchar as booking_status, s.source_type, s.category_min
  from public.open_spaces s
  where s.service_category_id = p_service_category_id
    and s.location_precision = 'EXACT';
end;
$$ language plpgsql stable;
