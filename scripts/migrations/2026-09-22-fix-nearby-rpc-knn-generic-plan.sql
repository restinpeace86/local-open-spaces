-- [나드리픽 앱 전반 성능 점검](2026-09-22 사용자 지시): "앱 전반적으로 느려.. 느린 원인
-- 확인하고 성능 튜닝 혹은 문제 있는 부분 점검". pg_stat_statements 실측 결과 지도/홈피드/
-- AI챗이 공통으로 쓰는 `get_nearby_spaces_and_events` RPC(p_category_mins IS NULL 분기)가
-- 평균 2.6초, 단일 호출 실측 최대 4.1초까지 걸리는 것을 확인했다.
--
-- [근본 원인] 이 RPC는 5개 인자(모두 PostgREST가 매 호출마다 JSON body에서 뽑아 바인딩
-- 파라미터로 넘김) 중 하나인 (user_lng, user_lat)로 KNN 최근접 검색
-- (`order by location::geography <-> user_point limit 1001`)을 두 번(open_spaces/events)
-- 수행한다. 이 쿼리를 독립적으로 문자열 리터럴을 박아 EXPLAIN ANALYZE하면 각각 70ms/
-- 63ms로 매우 빠르다(GiST 인덱스의 정렬된 순회를 그대로 활용) — 하지만 실제 RPC 호출은
-- 4초가 넘게 걸렸다. 원인은 PostgreSQL의 "generic plan" 전환: PostgREST는 이 함수를
-- 커넥션 풀 위에서 준비된 문(prepared statement)으로 반복 호출하는데, 같은 문이 5회
-- 이상 실행되면 Postgres가 매번 실제 좌표값으로 다시 계획을 세우는 대신 "일반화된"
-- 계획을 재사용하려 시도한다 — KNN(`<->`) 정렬은 계획 시점에 실제 좌표값을 알아야
-- GiST의 정렬 순회 최적화를 쓸 수 있는데, 일반화된 계획은 좌표를 알 수 없어 이
-- 최적화를 포기하고 훨씬 느린 전체 스캔+정렬로 폴백한다(PostgreSQL/PostGIS에서 잘
-- 알려진 함정). 실측으로 확인: 세션에 `SET plan_cache_mode = force_custom_plan`을
-- 걸고 같은 EXPLAIN을 돌리면 4121ms → 1690ms로 즉시 개선됐다(그마저도 이 세션은
-- 매 호출이 첫 실행이라 완전한 재현은 아니었지만, 방향성은 명확히 확인됨).
--
-- [수정] 함수별로 이 설정을 영구히 고정한다 — `ALTER FUNCTION ... SET plan_cache_mode
-- = force_custom_plan`은 그 함수가 호출될 때마다 항상 실제 파라미터 값으로 다시
-- 계획을 세우게 강제해, generic plan으로의 전환 자체를 원천 차단한다. 함수 로직은
-- 전혀 바뀌지 않고(동작/반환값 동일), 매 호출마다 계획 수립 비용이 약간 늘지만
-- (수 ms 수준) 지금의 초 단위 지연에 비하면 무시할 만하다. 두 오버로드(3-인자 버전은
-- st_dwithin 기반이라 이 문제의 영향을 덜 받을 것으로 보이지만, 같은 함수군이라
-- 일관성/방어 차원에서 함께 적용) 모두에 적용한다.
alter function public.get_nearby_spaces_and_events(double precision, double precision, integer)
  set plan_cache_mode = force_custom_plan;

alter function public.get_nearby_spaces_and_events(double precision, double precision, integer, text, text[])
  set plan_cache_mode = force_custom_plan;
