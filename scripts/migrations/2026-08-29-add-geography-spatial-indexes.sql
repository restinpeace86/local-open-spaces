-- [스팟픽 마커 미출현 버그 긴급 디버깅](2026-08-29)
--
-- 근본 원인(EXPLAIN ANALYZE로 실측 확인): open_spaces.location/events.location은
-- geometry 타입이고 기존 GIST 인덱스(idx_open_spaces_location, idx_events_location)도
-- geometry 연산자 클래스로 잡혀 있다. 그런데 get_nearby_spaces_and_events RPC는
-- st_dwithin/st_distance를 쓸 때 `location::geography`로 캐스팅한다(미터 단위 반경
-- 계산을 위해 필요 — geometry는 좌표계 단위가 도(degree)라 미터 반경 비교가 부정확함).
-- geometry 인덱스는 geography 캐스팅된 값의 연산자(geography_ops)를 지원하지 않아
-- 플래너가 인덱스를 전혀 못 쓰고 13만 건(open_spaces) 전체를 Parallel Seq Scan한다
-- (실측: 7.4초 소요, EXPLAIN 결과 "Rows Removed by Filter: 67742" — 인덱스 없이 매 행을
-- 다 걸러냄). 이게 "일시적 콜드 캐시"로 오인했던 지연/타임아웃의 진짜 원인이었다
-- (VACUUM ANALYZE로 dead tuple 23,137건을 정리했지만 이 문제와는 무관해 효과 없었음
-- — 별개의 두 가지 문제가 겹쳐 있었다).
--
-- 해결: location을 geography로 캐스팅한 값 자체에 대한 표현식(expression) GIST 인덱스를
-- 새로 추가한다. 순수 인덱스 추가라 기존 데이터/쿼리 결과에는 영향이 없고, 플래너가
-- 이제 이 인덱스를 골라 쓸 수 있게 된다. 기존 geometry 인덱스는 다른 geometry 연산(예:
-- st_x/st_y, 다른 geometry 기반 쿼리)에 여전히 쓰일 수 있어 그대로 둔다.
create index if not exists idx_open_spaces_location_geography
  on public.open_spaces using gist ((location::geography));

create index if not exists idx_events_location_geography
  on public.events using gist ((location::geography));
