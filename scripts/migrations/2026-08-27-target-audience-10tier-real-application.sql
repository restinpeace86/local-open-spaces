-- [10대 타겟 분류 체계 실데이터 반영] events.target_audience/target_audience_source 컬럼 추가
-- 대표 승인(2026-08-27, implementation/todo.md "대표 승인 완료 사항 잠정 규칙 5건")에 따라
-- docs/target-audience-10tier-dryrun-report.md에서 시뮬레이션 검증한 10대 분류 체계
-- (INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY/TEEN/YOUTH/ADULT/SENIOR/ALL/FACILITY)를 실제 반영한다.
-- 이 마이그레이션은 스키마 변경만 한다 — 실제 UPDATE는
-- scripts/ingest/lib/target-audience-taxonomy.mjs가 별도로 수행한다(category_maj 적용과 동일
-- 패턴: 스키마 변경과 데이터 변경을 분리해 각각 검증 가능하게 함).
alter table public.events
  add column if not exists target_audience text,
  add column if not exists target_audience_source text;

create index if not exists idx_events_target_audience on public.events (target_audience);

-- docs/spec.md 1절 "이벤트픽 화면 노출 3대 기본 전제 조건"(is_active=true AND
-- target_audience IN 5대 노출값 AND category_min IS NOT NULL) 조회를 위한 부분 인덱스.
-- is_active=true인 행만 부분 인덱스로 좁혀(전체 events의 극히 일부만 활성 상태) 조건절
-- 3개를 모두 인덱스 한 번으로 커버한다(2026-08-25-admin-data-grid-perf-indexes.sql과 동일하게
-- 실제 쿼리가 사용할 컬럼 조합 그대로 복합 인덱스를 만드는 방식을 따름).
create index if not exists idx_events_display_filter
  on public.events (target_audience, category_min)
  where is_active = true;
