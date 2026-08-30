-- [검색창/지도 검색 키워드 유연성 대폭 개선](2026-08-30 사용자 지시) 사전 조사 실측 발견:
-- open_spaces(141,980행)에 인덱스 없이 `name ILIKE '%어린이상상%'`를 실행하면 3.5초+가
-- 걸리고 부하가 걸린 시점에는 statement timeout으로 아예 실패하는 것을 실측으로 확인했다
-- (실제로 사용자가 언급한 "용인어린이상상의숲"으로 재현). "간헐적으로 결과가 누락된다"는
-- 증상과 정확히 일치하는 패턴(느린 쿼리는 부하/캐시 상태에 따라 성공하기도, 타임아웃
-- 나기도 함) — 순수 텍스트 매칭 유연성만 고쳐도 이 성능 문제는 그대로 남는다.
--
-- pg_trgm(트라이그램 인덱스)은 PostgreSQL에서 `ILIKE '%...%'`(양쪽 와일드카드) 패턴을
-- 빠르게 만드는 표준 확장이다 — 일반 B-tree 인덱스는 이 패턴에 전혀 도움이 안 되지만
-- (앞에 %가 있으면 인덱스를 탈 수 없음), GIN 트라이그램 인덱스는 문자열 어디에 있든
-- 부분 일치를 빠르게 찾는다. Supabase는 이 확장을 기본 지원한다(설치만 하면 됨,
-- `pg_available_extensions`로 사전 확인함).
create extension if not exists pg_trgm;

-- open_spaces: /nearby(스팟픽) 지도 검색, /admin/data-grid 검색 대상.
create index if not exists idx_open_spaces_name_trgm on public.open_spaces using gin (name gin_trgm_ops);
create index if not exists idx_open_spaces_address_trgm on public.open_spaces using gin (address gin_trgm_ops);

-- events: 이벤트픽 GNB 검색(/api/home/search), /admin/data-grid 검색 대상.
create index if not exists idx_events_title_trgm on public.events using gin (title gin_trgm_ops);
create index if not exists idx_events_description_trgm on public.events using gin (description gin_trgm_ops);
create index if not exists idx_events_venue_name_trgm on public.events using gin (venue_name gin_trgm_ops);

-- curated_items: 관리자 상품명 검색 대상(현재 규모는 작지만 향후 데이터가 늘어날 수 있어
-- 함께 대비해둔다).
create index if not exists idx_curated_items_title_trgm on public.curated_items using gin (title gin_trgm_ops);
