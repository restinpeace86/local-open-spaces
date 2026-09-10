-- [제휴 상품 연동 스팟을 노출 중분류와 무관하게 스팟픽에 노출](2026-09-10 사용자
-- 지시): "제휴 상품 관련 장소들이 스팟픽에서 안 보인다(노출 중분류 매핑이 없어서).
-- 해당 항목들은 노출 중분류와 상관없이 반경 내에 있으면 지도·바텀시트에 노출되게
-- 해줘. 현재 위치 기준 거리순으로 (예: 키즈친화식당 리스트에 반경 내 롯데월드
-- 제휴 상품도 거리에 맞춰 끼워넣기)."
--
-- get_spots_by_service_category와 동일한 RETURNS TABLE 형태로, WHERE 조건만
-- "노출 활성화 + 운영기간 유효한 curated_items가 연결된 스팟"으로 바꾼다.
-- (curated_items는 RLS+정책 없음이지만 이 함수는 SECURITY INVOKER — 호출부인
--  /api/nearby/deal-spots가 service_role로 실행하므로 접근 가능하다.)
create or replace function public.get_deal_spots()
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
language sql
stable
as $function$
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
  where s.location_precision = 'EXACT'
    and (s.group_id is null or s.is_dedup_representative = true)
    and exists (
      select 1 from public.curated_items ci
      where ci.spot_id = s.id
        and ci.is_active = true
        and (ci.operation_start_date is null or ci.operation_start_date <= current_date)
        and (ci.operation_end_date is null or ci.operation_end_date >= current_date)
    )
$function$;
