-- [배치 파이프라인 Fail-Safe 개선](2026-09-07, implementation/todo.md 개선사항1 3번):
-- "마지막 캐시 갱신 단계(REFRESH_SIGUNGU_OPTIONS_CACHE)에서 발생하는 statement
-- timeout 문제를 해결"
--
-- 실측 확인(docs/pipeline-log.md): 2026-09-04, 2026-09-06(2회), 2026-09-07(2회) —
-- REFRESH_SIGUNGU_OPTIONS_CACHE가 "canceling statement due to statement timeout"으로
-- 5회 연속 실패했다. 근본 원인: sigungu_options_cache는 open_spaces(14만+건)+
-- events(2만2천+건) 전체를 UNION ALL한 뒤 DISTINCT ON으로 재집계하는 materialized
-- view라(2026-09-04-sigungu-options-cache.sql), REFRESH MATERIALIZED VIEW는
-- CONCURRENTLY 여부와 무관하게 항상 이 무거운 쿼리를 처음부터 다시 전부 계산한다 —
-- 이 원래 쿼리 자체가 마이그레이션 도입 당시 실측 17.68초였던 바로 그 쿼리라
-- (get_sigungu_options 캐싱 이전 원본), REFRESH도 비슷한 시간이 걸려 PostgREST가
-- RPC 호출에 적용하는 8초 statement_timeout을 항상 초과했다.
--
-- 이 갱신은 배치 파이프라인의 마지막 유지보수 후처리 단계로, 하루 한 번만 실행되고
-- 실시간 응답이 필요 없다(get_sigungu_options() 자체는 이미 캐시를 읽기만 해 4.7ms로
-- 빠름 — 문제는 갱신 자체의 소요 시간이지 조회 속도가 아니다). 이런 드물고 무거운
-- 유지보수 작업에는 짧은 대화형 요청 기준 timeout을 그대로 적용할 이유가 없어,
-- 함수 내부에서만 국소적으로(SET LOCAL, 이 함수 호출의 현재 트랜잭션에만 적용되고
-- 끝나면 원래대로 돌아옴 — 다른 요청의 8초 제한에는 전혀 영향 없음) timeout을
-- 완화한다.
create or replace function public.refresh_sigungu_options_cache()
returns void as $$
begin
  -- 8초 기본값 대신 이 함수 호출 동안에만 2분까지 허용한다(현재 실측 대비 넉넉한
  -- 여유 — 데이터가 늘어나도 당분간 buffer가 충분하도록).
  perform set_config('statement_timeout', '120000', true);
  refresh materialized view concurrently public.sigungu_options_cache;
end;
$$ language plpgsql;
