-- /admin/data-grid 성능 수정 (2026-08-25 실측 중 발견): 관리자 그리드의 기본 정렬
-- (created_at DESC, nulls last)이 인덱스 없이 12만 건짜리 open_spaces 전체를 매번
-- Sort해야 해서(Gather Merge + Sort, 실측 3.9~4.3초) PostgREST RPC 경로의 statement_timeout
-- (8초) 경계를 위협했다. `created_at desc`만으로 인덱스를 만들면 기본 널 정렬이
-- `NULLS FIRST`가 되어 쿼리의 `NULLS LAST`와 어긋나 인덱스가 전혀 쓰이지 않았다(실측 확인) —
-- 반드시 `NULLS LAST`까지 인덱스 정의에 명시해야 정렬 순서가 정확히 일치해 Index Scan으로
-- 즉시 처리된다(실측: 4.3초 → 5ms).
create index if not exists idx_open_spaces_created_at on public.open_spaces (created_at desc nulls last);
create index if not exists idx_events_created_at on public.events (created_at desc nulls last);
