-- [7대 대분류 실제 적용] events.category_maj 컬럼 추가
-- 대표 승인(2026-08-26)에 따라 docs/category-taxonomy-7major-dryrun-report.md에서 시뮬레이션
-- 검증된 7대 대분류/36종 중분류 체계를 실제 반영한다. 이 마이그레이션은 컬럼 추가만 한다 —
-- 실제 UPDATE는 scripts/ingest/lib/category-maj-taxonomy.mjs가 별도로 수행한다(스키마 변경과
-- 데이터 변경을 분리해 각각 검증 가능하게 함).
alter table public.events
  add column if not exists category_maj text;

create index if not exists idx_events_category_maj on public.events (category_maj);
