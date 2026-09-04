-- [중복 스팟 탐지 — 실측 검증 중 발견한 네 번째 문제: 커서 페이지네이션 자체가
-- statement timeout](2026-09-05) 앞선 세 마이그레이션을 실측으로 하나씩 검증하는
-- 과정에서, `p_after_key`가 NULL일 때(첫 페이지)는 빠르지만(EXPLAIN ANALYZE로
-- 확인, 227ms) **NULL이 아닌 실제 커서 값을 넘기면(두 번째 페이지 이후) 즉시
-- statement timeout에 걸리는** 것을 실측으로 발견했다.
--
-- 원인 분석: 동일한 조건을 함수 밖에서 리터럴 값으로 직접 실행하면(EXPLAIN으로 확인)
-- `idx_open_spaces_dedup_scan_key` 인덱스를 정상적으로 쓰는 좋은 실행계획이 나온다 —
-- 즉 인덱스 자체나 조건식은 문제가 없다. 문제는 이 비교를 `language sql` 함수의
-- **파라미터**(`p_after_key`)로 넘겼을 때다 — 이 프로젝트에서 반복적으로 확인된
-- 패턴(2026-09-04 최초 timeout 사고와 동일한 클래스의 문제)대로, 값이 함수 호출
-- 시점의 리터럴이 아니라 파라미터로 전달되면 플래너가 실제 값을 알지 못한 채
-- "제네릭 계획"으로 최적화를 시도하다 인덱스를 포기하고 전체 스캔을 선택하는
-- 경우가 있다.
--
-- 해결: `language sql`(선언적, 파라미터가 컴파일 타임처럼 취급되길 바라지만
-- 보장되지 않음) 대신 `language plpgsql` + `EXECUTE format(...)`으로 바꿔, 매 호출마다
-- 커서 값을 **리터럴로 직접 삽입한 SQL 문자열**을 그때그때 새로 만들어 실행한다 —
-- 이렇게 하면 플래너가 항상 실제 값을 보고 계획을 세워(매번 즉석 SQL을 실행하는 것과
-- 동일한 효과) 인덱스 사용이 보장된다. `quote_literal`로 SQL 인젝션 없이 안전하게
-- 값을 삽입한다.
drop function if exists public.find_spot_dedup_candidates(integer, text);

create or replace function public.find_spot_dedup_candidates(
  p_limit integer default 50,
  p_after_key text default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_sql text;
  v_result jsonb;
begin
  v_sql := format(
    $sql$
    with scanned as (
      select
        id,
        name,
        category,
        category_min,
        address,
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(address, ''), '[[:space:]]', '', 'g'),
            '(번지|층|호)', '', 'g'
          ),
          '[^가-힣0-9a-zA-Z]', '', 'g'
        ) as normalized_address,
        case
          when location is not null
            and ST_Y(location::geometry) between 33 and 39
            and ST_X(location::geometry) between 124 and 132
          then ST_Y(location::geometry)
        end as lat,
        case
          when location is not null
            and ST_Y(location::geometry) between 33 and 39
            and ST_X(location::geometry) between 124 and 132
          then ST_X(location::geometry)
        end as lng,
        (
          coalesce(
            case
              when location is not null
                and ST_Y(location::geometry) between 33 and 39
                and ST_X(location::geometry) between 124 and 132
              then ST_GeoHash(location::geometry, 9)
            end,
            '~' || id::text
          ) collate "C"
        ) as scan_key
      from public.open_spaces
      where service_category_id is null
        %s
      order by scan_key
      limit %s
    )
    select jsonb_build_object(
      'candidates', coalesce((select jsonb_agg(to_jsonb(s) - 'scan_key') from scanned s), '[]'::jsonb),
      'next_cursor', (select scan_key from scanned order by scan_key collate "C" desc limit 1),
      'has_more', (select count(*) from scanned) = %s
    )
    $sql$,
    -- p_after_key를 리터럴로 직접 삽입한다(quote_literal로 안전하게 이스케이프) —
    -- 파라미터 바인딩이 아니라 매번 새로 계획되는 즉석 SQL로 만드는 것이 핵심이다.
    case
      when p_after_key is null then ''
      else format(
        'and (coalesce(case when location is not null and ST_Y(location::geometry) between 33 and 39 and ST_X(location::geometry) between 124 and 132 then ST_GeoHash(location::geometry, 9) end, ''~'' || id::text) collate "C") > %L collate "C"',
        p_after_key
      )
    end,
    p_limit,
    p_limit
  );

  execute v_sql into v_result;
  return v_result;
end;
$$;
