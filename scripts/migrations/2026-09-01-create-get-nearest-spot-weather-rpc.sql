-- [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 5단계(Weather & Air): "오늘"
-- 날짜를 선택했을 때 사용자 위치 근처의 날씨/대기질을 즉시 보여주기 위한 RPC다.
-- `spot_weather_caches`는 `spot_id`만 갖고 있어(좌표 없음) 사용자 위치 기준 "가장 가까운"
-- 캐시를 직접 조회할 방법이 없다 — `open_spaces`와 조인해 거리순 정렬 후 1건만 반환한다.
--
-- `get_nearby_spaces_and_events`(2026-08-28-nearby-rpc-category-min.sql)와 동일한
-- ST_DWithin/ST_Distance geography 캐스팅 관례를 그대로 따른다. max_radius_meters
-- 기본값 20km는 KMA 격자(5km)/에어코리아(시/도 단위)의 정밀도 특성상 이보다 멀어져도
-- 값이 더 정확해지지 않는 대신, 데이터가 없는 초광역 지역에서 무의미하게 먼 스팟까지
-- 끌어오는 것만 막는 안전장치다.
--
-- [SECURITY DEFINER가 필요한 이유 — 실측으로 발견] `spot_weather_caches`는 RLS를 켜고
-- 정책을 하나도 두지 않았다(service_role 전용, 2026-09-01-create-spot-weather-caches-
-- table.sql) — 이 챗봇은 로그인이 없는 완전 공개 기능이라 anon 키로 호출되는데, 기본
-- SECURITY INVOKER 함수는 호출자(anon)의 RLS를 그대로 적용받아 `spot_weather_caches`를
-- 전혀 읽지 못해 항상 빈 결과를 반환한다(PostgREST로 직접 실측 확인 — `supabase db query`
-- 관리자 연결로는 정상 조회되는데 anon 키로는 0건). `open_spaces`(anon 조회 가능)와
-- 조인하지만 "가장 가까운 스팟의 좌표"만 노출하고 캐시 테이블 자체를 열어주는 게 아니라는
-- 점에서 안전한 범위의 SECURITY DEFINER 사용이다 — search_path를 명시해 하이재킹을
-- 방지한다(Postgres SECURITY DEFINER 함수의 표준 방어 관례).
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
begin
  return query
  select
    st_distance(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
    w.temperature, w.precipitation_prob, w.sky_status, w.humidity,
    w.pm10, w.pm25, w.pm10_grade, w.pm25_grade, w.updated_at
  from public.spot_weather_caches w
  join public.open_spaces s on s.id = w.spot_id
  where s.location_precision = 'EXACT'
    and st_dwithin(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, max_radius_meters)
  order by distance_meters
  limit 1;
end;
$$ language plpgsql stable;
