-- [배치 안정성 진단 4가지 中 이슈 3/4](2026-09-18, implementation/todo.md 개선사항 2):
-- MATCH_EVENTS_TO_OPEN_SPACES와 REFRESH_EVENTS_FILTER_OPTIONS_CACHE가 매일 배치에서
-- "canceling statement due to statement timeout"으로 반복 실패하는 것을 실측으로
-- 진단하고 고친다(제3장 제5조 추측 금지 — 실제 EXPLAIN/타이밍으로 확인한 결과만 반영).
--
-- ## 이슈 3: match_events_to_open_spaces() 타임아웃
-- 실측(EXPLAIN, 인덱스 없음/카테시안 곱 가설은 틀림): idx_open_spaces_location_geography
-- GIST 인덱스와 events_pkey 인덱스 둘 다 정상적으로 쓰이고 있었다(Nested Loop +
-- Parallel Index Scan). 진짜 병목은 "space_id가 NULL인 이벤트"가 2026-09-12 RPC
-- 도입 이후 매일 누적돼(오래된 이벤트 중 애초에 매칭될 스팟이 없는 것들도 계속
-- 남아있음) 매일 전체를 재스캔하면서, 이벤트당 open_spaces GIST 인덱스 프로브 +
-- 정규식/ILIKE 계산을 하는 Nested Loop 반복 횟수가 계속 커진 것이다(EXPLAIN 기준
-- Nested Loop 하나가 전체 비용의 대부분을 차지, rows=4009 반복).
-- 이 기능의 원래 목적("이번에 새로 들어온 이벤트를 관리자가 이미 큐레이션해 둔 스팟에
-- 자동 연결")은 애초에 최근 수집분만 대상으로 하면 충분하다 — 그래서 기본값
-- p_since_days=3(당일 배치가 하루 이상 밀려도 안전한 여유)으로 후보를 좁힌다.
-- 필요하면 p_since_days => null로 호출해 예전처럼 전체를 한 번에 재스캔할 수 있게
-- 파라미터로 남겨둔다(과거 동작을 완전히 없애지 않음).
--
-- ## 이슈 4: refresh_events_filter_options_cache() 타임아웃
-- 실측(Supabase CLI로 직접 REFRESH 실행, 실제 소요시간 측정): 약 18초 소요 — DB
-- 서버 설정 자체의 statement_timeout(120초, pg_settings 실측 확인)보다는 훨씬
-- 짧지만, 이 함수가 PostgREST RPC 경로(run-daily.mjs가 실제로 호출하는 경로)를
-- 통해 실행될 때는 그보다 훨씬 짧은 타임아웃에 걸린다(pipeline_logs에 반복 재현된
-- "canceling statement due to statement timeout" 실측 로그로 확인). 원인이 role
-- 설정(pg_roles.rolconfig에는 service_role 오버라이드 없음)인지 커넥션 풀러가
-- 주입하는 값인지는 명확히 특정할 수 없었지만, 어느 경로든 함수 정의 자체에
-- `set statement_timeout`을 걸면 그 함수 실행 동안만 확실히 넉넉한 값으로
-- 덮어써진다(PostgreSQL 표준 기능 — 세션이 무엇을 상속했든 함수 호출 동안은 이
-- 값이 우선 적용되고 함수가 끝나면 자동으로 원래 값으로 복귀한다). 두 함수 모두
-- 이 방식으로 고정한다(제5장 제4조 기존 구조 우선 — 함수 시그니처/호출부는 그대로).

-- [실측 버그 수정] create or replace는 인자 시그니처가 다르면 기존 함수를 대체하지
-- 않고 오버로드로 나란히 남긴다(실제 겪음: PostgREST가 "Could not choose the best
-- candidate function between..." 에러로 두 개를 구분 못 함) — 인자 없는 옛 버전을
-- 먼저 명시적으로 지운다.
drop function if exists public.match_events_to_open_spaces();

create or replace function public.match_events_to_open_spaces(p_since_days integer default 3)
returns integer
language plpgsql
set statement_timeout = '60s'
as $$
declare
  v_updated_count integer;
begin
  with matched as (
    select distinct on (e.id)
      e.id as event_id,
      o.id as space_id
    from public.events e
    join public.open_spaces o
      on e.location is not null
      and o.location is not null
      and st_dwithin(e.location::geography, o.location::geography, 30)
      and (
        o.name ilike '%' || regexp_replace(trim(e.venue_name), '[()%_]', '', 'g') || '%'
        or trim(e.venue_name) ilike '%' || regexp_replace(o.name, '[()%_]', '', 'g') || '%'
      )
    where e.space_id is null
      and e.venue_name is not null
      and length(trim(e.venue_name)) >= 2
      and (p_since_days is null or e.created_at >= now() - (p_since_days || ' days')::interval)
    order by e.id, st_distance(e.location::geography, o.location::geography)
  )
  update public.events e
  set space_id = matched.space_id
  from matched
  where e.id = matched.event_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.refresh_events_filter_options_cache()
returns void
language plpgsql
set statement_timeout = '60s'
as $$
begin
  refresh materialized view concurrently public.events_filter_options_cache;
end;
$$;
