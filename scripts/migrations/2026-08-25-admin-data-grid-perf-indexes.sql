-- /admin/data-grid 성능 수정 (2026-08-25 실측 중 발견): 관리자 그리드의 기본 정렬
-- (created_at DESC, nulls last)이 인덱스 없이 12만 건짜리 open_spaces 전체를 매번
-- Sort해야 해서(Gather Merge + Sort, 실측 3.9~4.3초) PostgREST RPC 경로의 statement_timeout
-- (8초) 경계를 위협했다. `created_at desc`만으로 인덱스를 만들면 기본 널 정렬이
-- `NULLS FIRST`가 되어 쿼리의 `NULLS LAST`와 어긋나 인덱스가 전혀 쓰이지 않았다(실측 확인) —
-- 반드시 `NULLS LAST`까지 인덱스 정의에 명시해야 정렬 순서가 정확히 일치해 Index Scan으로
-- 즉시 처리된다(실측: 4.3초 → 5ms).
create index if not exists idx_open_spaces_created_at on public.open_spaces (created_at desc nulls last);
create index if not exists idx_events_created_at on public.events (created_at desc nulls last);

-- 후속 수정([전체 파이프라인 일괄 가동], 2026-08-25): 17개 어댑터 전부가 source를 채우게 된
-- 뒤, "source로 필터 + created_at 정렬" 조합(관리자 그리드의 출처 필터 사용 시 실제 쿼리
-- 형태)에서 옵티마이저가 위 created_at 인덱스를 그대로 타면서 정렬 순서만 만족시키고 source
-- 필터는 나중에 걸러(Filter, Rows Removed) 버려, 원하는 50건을 찾기 전까지 관련 없는 행을
-- 수만~십만 건 단위로 훑고 지나가는 문제를 실측으로 확인했다(source='tourapi_4.0' 예시:
-- 22,674건 중 50건을 찾는데 115,794건을 먼저 걸러내며 16.2초 소요). source를 먼저 인덱스로
-- 좁힌 뒤 그 안에서만 정렬하도록 (source, created_at) 복합 인덱스를 추가한다(실측: 16.2초 →
-- 10.9ms).
create index if not exists idx_open_spaces_source_created_at on public.open_spaces (source, created_at desc nulls last);
create index if not exists idx_events_source_created_at on public.events (source, created_at desc nulls last);
