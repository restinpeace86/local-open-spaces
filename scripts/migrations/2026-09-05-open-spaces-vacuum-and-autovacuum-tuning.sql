-- [/admin/data-grid 초기 진입 극심한 지연](2026-09-05 사용자 지시): "각 탭에 대하여는
-- 탭 누를때 데이터 호출하는거 맞지? 지연되는 문제를 좀 잡아줘"
--
-- 실측 원인(EXPLAIN ANALYZE로 직접 확인): 코드 버그가 아니라 open_spaces 테이블의
-- VACUUM이 밀린 것이었다. page.tsx가 병렬로 부르는 8개 필터 옵션 RPC 중
-- get_open_spaces_source_type_options()가 8.6초 만에 statement_timeout으로 실패
-- 했고(rpcWithRetry가 재시도까지 하며 페이지 전체를 20초 넘게 붙잡음), 그 내부
-- 쿼리를 직접 EXPLAIN (analyze, buffers)로 까보니:
--
--   Index Only Scan using idx_open_spaces_source_type_created_at ...
--     (actual time=6.174..18011.249 rows=142113 loops=1)
--     Heap Fetches: 73221
--
-- "Heap Fetches"가 142,113건 중 73,221건(절반 이상)이나 발생했다는 건 Index Only
-- Scan이 정상적으로 인덱스만으로 끝나지 못하고 실제 힙 페이지를 다시 읽어야 했다는
-- 뜻 — visibility map이 오래돼(최근 VACUUM이 안 돌아서) "이 페이지는 전부 보임"
-- 표시가 안 돼 있었기 때문이다. pg_stat_user_tables 확인 결과 last_autovacuum이
-- 2026-08-29(약 1주일 전)로 멈춰 있었고, n_dead_tup(19,025) / n_live_tup(142,182)
-- ≈ 13.4%로 Postgres 기본 autovacuum 임계값(20%, autovacuum_vacuum_scale_factor)에
-- 아직 못 미쳐 autovacuum이 트리거되지 않고 있었다 — 그 사이 매일 배치 수집/관리자
-- 대량 UPDATE가 계속 쌓이며 visibility map만 계속 낡아간 것.
--
-- 조치:
-- 1) 지금 당장의 지연을 없애기 위해 즉시 VACUUM(ANALYZE)을 수동 실행해 visibility
--    map과 통계를 갱신한다.
-- 2) 같은 문제가 재발하지 않도록, 이 테이블만 기본값(20%)보다 훨씬 낮은
--    autovacuum 임계값(5%)으로 낮춰 dead tuple이 쌓이기 전에 더 자주 자동
--    vacuum/analyze가 돌게 한다 — 이 테이블은 배치 적재/관리자 대량 UPDATE가
--    잦고, 이 admin 페이지의 필터 옵션 RPC들이 Index Only Scan(visibility map
--    신선도에 민감)에 크게 의존해 다른 테이블보다 더 촘촘한 vacuum이 필요하다.
vacuum (analyze) public.open_spaces;

alter table public.open_spaces set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);
