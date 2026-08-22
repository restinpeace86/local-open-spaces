-- Task 9-1-8 (2026-08-22): GPS 실패 시 수동 선택 시트가 쓸 시/군/구 목록 + 대표 좌표.
-- open_spaces/events 양쪽에서 sigungu_name이 채워진 행을 모아 지역별로 하나씩(대표 좌표)만
-- 골라 반환한다. 좌표는 실제로 저장된 데이터의 좌표를 그대로 쓴다(임의 생성/추측 없음).
CREATE OR REPLACE FUNCTION get_sigungu_options()
RETURNS TABLE(sigungu_name text, lng double precision, lat double precision) AS $$
  SELECT DISTINCT ON (combined.sigungu_name)
    combined.sigungu_name,
    ST_X(combined.location) AS lng,
    ST_Y(combined.location) AS lat
  FROM (
    SELECT sigungu_name, location FROM open_spaces WHERE sigungu_name IS NOT NULL
    UNION ALL
    SELECT sigungu_name, location FROM events WHERE sigungu_name IS NOT NULL
  ) AS combined
  ORDER BY combined.sigungu_name;
$$ LANGUAGE sql STABLE;
