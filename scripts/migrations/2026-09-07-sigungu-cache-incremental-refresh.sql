-- [배치 파이프라인 Fail-Safe 개선](2026-09-07, implementation/todo.md 개선사항1 3번
-- 후속 — 2026-09-07-fix-sigungu-cache-refresh-timeout.sql의 SET LOCAL statement_timeout
-- 완화 시도가 실측상 효과가 없어(같은 PostgREST RPC 경로에서 여전히 정확히 8초 만에
-- "canceling statement due to statement timeout" — 로컬 SET LOCAL로 넘을 수 없는
-- 계층에서 강제되는 것으로 판단) 근본적으로 다른 접근으로 교체한다.
--
-- 실측 재확인: run-daily.mjs와 동일한 경로(supabase-js RPC, service role)로
-- refresh_sigungu_options_cache()를 직접 호출 → 8,762ms에 정확히 timeout. SET LOCAL이
-- 안 먹힌 것으로 보아 이 8초 제한은 이 프로젝트가 통제할 수 없는 계층(Supabase
-- 커넥션 풀러 등)에서 강제되는 것으로 판단, 타임아웃 자체를 늘리려 하지 않고 작업을
-- 8초 안에 끝나도록 줄이는 쪽으로 접근을 바꾼다 — todo.md가 원래 제안한 "증분 처리"
-- 방향과 일치한다.
--
-- 근본 원인: sigungu_name은 "새 지역이 처음 수집될 때만" 늘어나는 참조 데이터인데도
-- (2026-09-04-sigungu-options-cache.sql 주석 참고), materialized view REFRESH는
-- 매번 open_spaces(14만+)+events(2만2천+) 전체를 처음부터 다시 집계한다. 이미 캐시에
-- 있는 sigungu_name은 다시 계산할 필요가 없으므로, materialized view를 일반 테이블로
-- 바꾸고 "최근 며칠 내 새로 생성된 행"만 훑어 캐시에 없는 이름만 추가하는 증분
-- upsert로 교체한다 — 이러면 매일 수천 건 규모(그날 배치 적재량)만 스캔하면 되고,
-- created_at 인덱스를 그대로 활용할 수 있어 수 밀리초 수준으로 끝난다.
drop function if exists public.refresh_sigungu_options_cache();
drop function if exists public.get_sigungu_options();

alter materialized view if exists public.sigungu_options_cache rename to sigungu_options_cache_mv_old;

create table if not exists public.sigungu_options_cache (
  sigungu_name text primary key,
  lng double precision,
  lat double precision
);

-- 기존 materialized view에 이미 쌓여 있던 값을 그대로 이어받는다(처음부터 다시 긁을
-- 필요 없음 — 앞으로는 증분만 추가).
insert into public.sigungu_options_cache (sigungu_name, lng, lat)
select sigungu_name, lng, lat from public.sigungu_options_cache_mv_old
on conflict (sigungu_name) do nothing;

drop materialized view if exists public.sigungu_options_cache_mv_old;

create or replace function public.get_sigungu_options()
returns table(sigungu_name text, lng double precision, lat double precision) as $$
  select sigungu_name, lng, lat from public.sigungu_options_cache order by sigungu_name;
$$ language sql stable;

-- [증분 갱신] 최근 3일 이내 새로 생성된 행만 훑어(하루 1회 배치 실행 기준 넉넉한
-- 버퍼 — 하루 실행을 놓쳐도 다음 실행에서 자연히 따라잡음), 캐시에 아직 없는
-- sigungu_name만 추가한다. 이미 있는 이름은 매번 건드릴 필요가 없다(좌표도 대표값
-- 하나면 충분 — 정확한 중심점이 아니라 "지도 이동을 위한 근사 좌표" 용도, 기존
-- materialized view도 동일하게 DISTINCT ON 임의 대표값이었다). created_at 인덱스를
-- 타므로 매일 수천 건 규모만 스캔해 기존 17.68초짜리 전체 재계산과 달리 수 밀리초
-- 수준으로 끝난다.
create or replace function public.refresh_sigungu_options_cache()
returns void as $$
begin
  insert into public.sigungu_options_cache (sigungu_name, lng, lat)
  select distinct on (combined.sigungu_name)
    combined.sigungu_name,
    st_x(combined.location) as lng,
    st_y(combined.location) as lat
  from (
    select sigungu_name, location from public.open_spaces
    where sigungu_name is not null and created_at >= now() - interval '3 days'
    union all
    select sigungu_name, location from public.events
    where sigungu_name is not null and created_at >= now() - interval '3 days'
  ) as combined
  order by combined.sigungu_name
  on conflict (sigungu_name) do nothing;
end;
$$ language plpgsql;
