-- [AI 챗봇 맞춤 추천 상세 구현(초개인화 고도화)](2026-09-02 사용자 지시) Step 1 구현 중
-- 실측으로 발견한 성능 함정: /api/ai-chat/weather가 서울 도심 좌표에서 매번
-- "canceling statement due to statement timeout"으로 실패했다. EXPLAIN ANALYZE로 직접
-- 확인한 원인 — get_nearest_spot_weather(2026-09-01 도입)가 st_dwithin(반경 20km) +
-- st_distance 정렬 + limit 1 방식이라, 스팟이 밀집한 지역(서울 도심 20km 반경 내
-- open_spaces 3만9천여 건)에서는 먼저 반경 내 후보를 전부 모은 뒤(Bitmap Heap Scan)
-- spot_weather_caches와 Nested Loop 조인을 그 후보 전부(약 2만5천 건)에 대해 반복
-- 수행하고 나서야 정렬·limit을 적용한다 — 실측 3.86초(Execution Time), PostgREST의
-- statement_timeout(8초)에 여유가 있어 보여도 anon 경로의 커넥션 풀/동시 요청 상황에서는
-- 실제로 타임아웃까지 걸렸다.
--
-- 해결: PostGIS의 KNN 인덱스 연산자(`<->`)로 정렬하면 GiST 인덱스
-- (idx_open_spaces_location_geography, 2026-08-29 도입 — geography 캐스팅 표현식
-- GiST)가 "가장 가까운 점부터 순서대로" 필요한 만큼만 훑는 진짜 최근접(K-최근접이웃)
-- 탐색을 쓸 수 있어, 반경 내 후보 수와 무관하게 즉시 응답한다. 반경 제한(max_radius_meters)
-- 은 KNN으로 찾은 최근접 1건의 거리를 사후 필터링하는 방식으로 유지한다(반경 밖이면
-- 빈 결과 — "그 근처엔 데이터가 없다"는 기존 의미 그대로 보존).
create or replace function public.get_nearest_spot_weather(
  user_lng double precision,
  user_lat double precision,
  max_radius_meters int default 20000
)
returns table (
  distance_meters float,
  temperature numeric,
  precipitation_prob int,
  sky_status text,
  humidity int,
  pm10 numeric,
  pm25 numeric,
  pm10_grade text,
  pm25_grade text,
  updated_at timestamptz
)
security definer
set search_path = public
as $$
declare
  user_point geography := st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography;
begin
  return query
  select nearest.distance_meters, nearest.temperature, nearest.precipitation_prob, nearest.sky_status,
    nearest.humidity, nearest.pm10, nearest.pm25, nearest.pm10_grade, nearest.pm25_grade, nearest.updated_at
  from (
    select
      st_distance(s.location::geography, user_point) as distance_meters,
      w.temperature, w.precipitation_prob, w.sky_status, w.humidity,
      w.pm10, w.pm25, w.pm10_grade, w.pm25_grade, w.updated_at
    from public.spot_weather_caches w
    join public.open_spaces s on s.id = w.spot_id
    where s.location_precision = 'EXACT'
    order by s.location::geography <-> user_point
    limit 1
  ) nearest
  where nearest.distance_meters <= max_radius_meters;
end;
$$ language plpgsql stable;
