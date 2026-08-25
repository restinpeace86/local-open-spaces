-- Decision 017: 공공데이터 원천 메타필드 직수집 / Null-safe 전수 적재 / source 표기 지원.
--
-- 1) events / open_spaces에 원천 출처 식별용 `source` 컬럼 추가 (예: 'seoul_public_reservation').
-- 2) events에 원천 메타필드(MAXCLASSNM/MINCLASSNM 등) 보존용 `raw_data` jsonb 추가
--    (open_spaces는 기존에 이미 raw_data 컬럼을 갖고 있다 — 동일 패턴을 events에도 적용).
-- 3) open_spaces.location의 NOT NULL을 해제하고 location_precision 컬럼을 추가한다.
--    Decision 009가 events에 도입한 EXACT/CITY_APPROX/UNKNOWN 정밀도 구분과 완전히 동일한
--    패턴이다 — 위치정보가 없는 체육시설/공간시설 원본도 드롭하지 않고 NULL로 적재하기 위함.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source VARCHAR(100);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS raw_data jsonb;

ALTER TABLE public.open_spaces
  ADD COLUMN IF NOT EXISTS source VARCHAR(100);

ALTER TABLE public.open_spaces ALTER COLUMN location DROP NOT NULL;

ALTER TABLE public.open_spaces
  ADD COLUMN IF NOT EXISTS location_precision VARCHAR(20) NOT NULL DEFAULT 'EXACT';

ALTER TABLE public.open_spaces
  ADD CONSTRAINT open_spaces_location_precision_values_check
  CHECK (location_precision IN ('EXACT', 'CITY_APPROX', 'UNKNOWN'));

ALTER TABLE public.open_spaces
  ADD CONSTRAINT open_spaces_location_precision_consistency_check
  CHECK (
    (location_precision = 'UNKNOWN' AND location IS NULL)
    OR (location_precision != 'UNKNOWN' AND location IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_open_spaces_location_precision ON public.open_spaces (location_precision);
CREATE INDEX IF NOT EXISTS idx_open_spaces_source ON public.open_spaces (source);
CREATE INDEX IF NOT EXISTS idx_events_source ON public.events (source);

-- get_nearby_spaces_and_events RPC: open_spaces도 이제 비-EXACT 정밀도를 가질 수 있으므로,
-- events 분기(2026-08-23-nearby-rpc-exact-precision-only.sql)와 동일하게 EXACT 행만 노출한다.
-- 함수 시그니처/반환 컬럼/events 분기는 기존과 완전히 동일, open_spaces 분기 WHERE절에만
-- location_precision = 'EXACT' 조건을 추가한다.
CREATE OR REPLACE FUNCTION public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters int DEFAULT 3000
)
RETURNS TABLE (
  id uuid, name varchar, category varchar, distance_meters float, item_type varchar,
  lng double precision, lat double precision, address text, thumbnail_url text,
  start_date date, end_date date, reservation_start_date timestamptz,
  reservation_end_date timestamptz, reservation_url text, is_reservation_required boolean,
  operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean,
  has_parking boolean, stroller_accessible boolean, facility_type varchar,
  target_age_group varchar, booking_status varchar
) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT s.id, s.name, s.category,
      st_distance(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) AS distance_meters,
      'SPACE'::varchar AS item_type,
      st_x(s.location) AS lng, st_y(s.location) AS lat, s.address,
      NULL::text AS thumbnail_url, NULL::date AS start_date, NULL::date AS end_date,
      NULL::timestamptz AS reservation_start_date, NULL::timestamptz AS reservation_end_date,
      NULL::text AS reservation_url, NULL::boolean AS is_reservation_required,
      s.operating_hours, s.is_free, s.info_url,
      s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
      NULL::varchar AS booking_status
    FROM public.open_spaces s
    WHERE s.location_precision = 'EXACT'
      AND st_dwithin(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
    UNION ALL
    SELECT e.id, e.title AS name, e.event_type AS category,
      st_distance(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) AS distance_meters,
      'EVENT'::varchar AS item_type,
      st_x(e.location) AS lng, st_y(e.location) AS lat,
      NULL::text AS address, e.thumbnail_url, e.start_date, e.end_date,
      e.reservation_start_date, e.reservation_end_date, e.reservation_url, e.is_reservation_required,
      NULL::text AS operating_hours, e.is_free, NULL::text AS info_url,
      e.is_kids_friendly, e.has_parking, e.stroller_accessible, e.facility_type, e.target_age_group, e.booking_status
    FROM public.events e
    WHERE e.is_active = true
      AND e.location_precision = 'EXACT'
      AND st_dwithin(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
  ) combined
  ORDER BY distance_meters
  LIMIT 201;
END;
$$ LANGUAGE plpgsql STABLE;
