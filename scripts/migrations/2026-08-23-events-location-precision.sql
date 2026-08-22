-- Task 9-6-2 / Decision 009: 경기데이터드림 API1(GGCULTUREVENTSTUS)처럼 원본에 좌표가 전혀
-- 없는 소스를 위해 events.location NOT NULL을 해제하고 location_precision으로 정밀도를 구분한다.
-- EXACT=실제 주소 지오코딩, CITY_APPROX=텍스트 매칭된 시/군 중심좌표 근사, UNKNOWN=좌표 없음.
ALTER TABLE public.events ALTER COLUMN location DROP NOT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location_precision VARCHAR(20) NOT NULL DEFAULT 'EXACT';

ALTER TABLE public.events
  ADD CONSTRAINT events_location_precision_values_check
  CHECK (location_precision IN ('EXACT', 'CITY_APPROX', 'UNKNOWN'));

-- 정합성 보장: UNKNOWN이면 반드시 location도 NULL, 그 외에는 반드시 location이 있어야 한다.
ALTER TABLE public.events
  ADD CONSTRAINT events_location_precision_consistency_check
  CHECK (
    (location_precision = 'UNKNOWN' AND location IS NULL)
    OR (location_precision != 'UNKNOWN' AND location IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_events_location_precision ON public.events (location_precision);
