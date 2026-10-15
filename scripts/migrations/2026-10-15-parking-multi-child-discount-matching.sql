-- [다자녀 할인 혜택 매칭용 반경검색 RPC](implementation/todo.md 개선사항3,
-- 2026-10-15) — 경기도/서울시 다자녀 할인 CSV 각 행(혜택 레코드)의 좌표(또는
-- 지오코딩된 좌표) 기준으로 가까운 parking_metadata 후보를 찾는다.
--
-- [find_busul_parking_candidates와 다른 점] 그 함수는 "부설 주차장 ↔ 스팟"
-- 양쪽 다 테이블에 있는 조인이었지만, 여기는 한쪽(혜택 CSV 행)이 테이블에
-- 없는 외부 좌표라 단순 "한 점 기준 반경검색"이 필요하다 — 노상 제외 없이
-- parking_metadata 전체(노외+부설 둘 다, 할인이 어느 유형에든 적용될 수
-- 있으므로)를 대상으로 한다.
create or replace function public.search_parking_metadata_near(
  target_lng double precision,
  target_lat double precision,
  radius_meters integer default 50
)
returns table(
  id uuid,
  name text,
  distance_meters double precision
)
language sql
stable
as $function$
  select
    p.id,
    p.name,
    st_distance(p.location::geography, st_setsrid(st_makepoint(target_lng, target_lat), 4326)::geography) as distance_meters
  from public.parking_metadata p
  where p.location is not null
    and st_dwithin(
      p.location::geography,
      st_setsrid(st_makepoint(target_lng, target_lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters
  limit 10;
$function$;

comment on function public.search_parking_metadata_near(double precision, double precision, integer) is
  '다자녀 할인 매칭(parking-multi-child-discount.mjs) 전용 — 외부 좌표 1점 기준
   parking_metadata 반경검색. find_busul_parking_candidates와 달리 양쪽 테이블
   조인이 아니라 단일 지점 기준 검색.';
