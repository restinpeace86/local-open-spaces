-- [open_spaces 성능 최적화 및 타임아웃 재발 방지](2026-08-28)
--
-- 배경: 이 세션에서 반복 확인된 패턴(implementation/2026-08-27-category-min-filter-options-fix.md,
-- docs/pipeline-log.md 2026-08-28 10:19 SEOUL_YEYAK 상세 리포트 — open_spaces 1290건 중
-- 0건 적재) — playground(82,373건) 등 대량 배치 직후 플래너 통계가 stale해지면, 바로 다음
-- open_spaces upsert(ON CONFLICT 처리 시 기존 행 스캔 계획)가 잘못된 실행계획을 선택해
-- statement timeout으로 실패한다. 지금까지는 매번 Supabase SQL 콘솔에서 수동으로
-- `ANALYZE public.open_spaces;`를 실행해 대응했는데(제5장 제6조 구현 완료 기준의 재발 방지
-- 취지에 맞지 않음), 매 수집 배치(run-daily.mjs/run-monthly.mjs) 종료 시 자동으로 통계를
-- 갱신하도록 RPC로 노출해 구조적으로 재발을 막는다.
--
-- ANALYZE는 VACUUM과 달리 트랜잭션 블록 안에서 실행 가능하므로 일반 plpgsql 함수로 작성할 수
-- 있다(PostgreSQL 공식 문서 기준 사실 확인 — VACUUM만 트랜잭션 블록 내 실행 불가).
-- SECURITY DEFINER + service_role 전용 GRANT로 anon/authenticated가 호출하지 못하게 한다
-- (get_nearby_spaces_and_events 등 기존 RPC와 달리 이 함수는 클라이언트가 아닌 수집
-- 파이프라인 전용이라 공개 권한을 주지 않는다).
-- 실측 확인(2026-08-28, 최초 배포 직후): 이 함수를 PostgREST RPC로 호출하자 ANALYZE 자체가
-- "canceling statement due to statement timeout"으로 실패했다 — Supabase가 API 경유 요청에
-- 적용하는 짧은 statement_timeout(역할 기본값)이 ANALYZE 소요 시간보다 짧기 때문이다(Supabase
-- SQL 콘솔에서 수동 실행할 때는 이 제약이 없어 지금까지 항상 성공했다). 함수 전용 GUC로
-- statement_timeout을 5분으로 늘려 호출 경로와 무관하게 항상 완료되도록 한다.
CREATE OR REPLACE FUNCTION public.analyze_open_spaces()
RETURNS void AS $$
BEGIN
  ANALYZE public.open_spaces;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET statement_timeout = '300000';

REVOKE ALL ON FUNCTION public.analyze_open_spaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analyze_open_spaces() TO service_role;
