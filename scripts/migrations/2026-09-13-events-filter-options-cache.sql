-- [get_events_filter_options() 간헐적 statement timeout 진단/수정](2026-09-13 사용자
-- 지시): "get_events_filter_options 조회 실패: canceling statement due to statement
-- timeout" — 오늘 SEOUL_YEYAK 대량 재수집 직후 관리자 화면에서 재현.
--
-- 실측 진단(EXPLAIN ANALYZE, Supabase Management API로 직접 확인):
--   - source/event_type 서브쿼리는 Index Only Scan으로 80~120ms — 문제 없음.
--   - raw_data->>'MINCLASSNM' 서브쿼리: Index Scan(힙 방문 필요) + array_agg(distinct
--     ... order by ...)의 정렬/중복제거 비용까지 겹쳐 최대 3.3초.
--   - raw_data->>'SVCSTATNM' 서브쿼리도 최대 약 1초.
--   - 네 서브쿼리가 한 문장 안에서 순차 실행되므로 합산 시간이 authenticated/anon
--     롤의 statement_timeout(8초, pg_roles.rolconfig 실측 확인 — Management API
--     세션의 2분과는 다른 값이었다)을 넘길 수 있다. MINCLASSNM/SVCSTATNM은 오직
--     SEOUL_YEYAK 소스에만 있는 raw_data 필드라, 이 소스가 매일 대량으로 재적재될
--     때마다 해당 행들이 전부 "막 갱신된 행"이 되어 이 문제가 반복 재현될 수 있다.
--
-- 이 문서(get-sigungu-options 2026-09-04 수정, sigungu-options-cache.sql)에 이미
-- 정확히 같은 모양의 문제("매 요청마다 전체 재집계 → 8초 타임아웃")를 머티리얼라이즈드
-- 뷰 캐싱으로 해결한 선례가 있다 — 이 함수가 반환하는 값(관리자 필터 드롭다운
-- 후보 목록)도 "실시간 최신성이 필요 없는 참조성 데이터"라는 점이 동일해 같은
-- 패턴을 그대로 재사용한다(제5장 제4조 기존 구조 우선). 함수 시그니처는 그대로
-- 유지해 프런트엔드(src/app/admin/data-grid/page.tsx)는 코드 변경이 필요 없다.
create materialized view if not exists public.events_filter_options_cache as
select
  true as id,
  (select array_agg(distinct source order by source) from public.events where source is not null) as sources,
  (select array_agg(distinct event_type order by event_type) from public.events where event_type is not null) as event_types,
  (select array_agg(distinct raw_data->>'MINCLASSNM' order by raw_data->>'MINCLASSNM')
     from public.events where raw_data->>'MINCLASSNM' is not null) as min_class_names,
  (select array_agg(distinct raw_data->>'SVCSTATNM' order by raw_data->>'SVCSTATNM')
     from public.events where raw_data->>'SVCSTATNM' is not null) as svc_stat_nms;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY에 필요(락 없이 갱신하려면 고유 인덱스
-- 필수) — 행이 항상 1건뿐이라 상수 컬럼(id)에 유니크 인덱스를 둔다.
create unique index if not exists idx_events_filter_options_cache_id on public.events_filter_options_cache (id);

create or replace function public.get_events_filter_options()
returns table(sources text[], event_types text[], min_class_names text[], svc_stat_nms text[])
language sql stable
as $$
  select sources, event_types, min_class_names, svc_stat_nms
  from public.events_filter_options_cache
  limit 1;
$$;

-- 이 참조 데이터는 새로운 source/event_type/원천 중분류/접수상태 값이 처음
-- 수집되거나 바뀔 때만 달라진다 — 실시간 최신성이 필요 없으므로,
-- scripts/ingest/run-daily.mjs의 후처리 단계(REFRESH_EVENTS_FILTER_OPTIONS_CACHE)에서
-- 매일 배치 끝에 한 번씩 갱신한다.
create or replace function public.refresh_events_filter_options_cache()
returns void as $$
begin
  refresh materialized view concurrently public.events_filter_options_cache;
end;
$$ language plpgsql;

-- 최초 1회 즉시 채워둔다(REFRESH를 기다리지 않고 바로 조회 가능하도록).
select public.refresh_events_filter_options_cache();
