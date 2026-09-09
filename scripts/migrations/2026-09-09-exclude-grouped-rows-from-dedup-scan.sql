-- [개선사항1 버그 수정](2026-09-09, todo.md): "캠핑장 중복 스팟 검수 화면에서
-- 약 1,500건 이상에 대해 대표 상호명을 지정하고 그룹핑/병합 저장을 수행함.
-- 하지만 작업을 마치고 페이지를 리프레시하자, 이전에 검수하고 저장했던
-- 내용들에 대하여 다시 수행하라고 초기 상태로 돌아감."
--
-- [근본 원인, 실측으로 확정] find_spot_dedup_candidates(2026-09-09-spot-dedup-
-- by-category-and-auto-group.sql로 노출 중분류 지정 스캔 추가)의 WHERE 절은
-- `service_category_id is null` 또는 `service_category_id = p_service_category_id`
-- 만 걸렀지, 이미 그룹으로 확정된(group_id IS NOT NULL) 행을 전혀 제외하지
-- 않았다. 중분류 지정 스캔에서는 병합해도 service_category_id가 그대로라
-- (같은 중분류를 유지하는 게 의도된 동작) 매 스캔마다 이미 처리한 그룹이
-- 다시 후보로 잡혔다 — 저장/조회 자체는 정상이었고(실측: open_spaces에
-- group_id 있는 행 592건, spot_dedup_groups 이력 265건, 전부 캠핑장
-- 중분류로 정상 저장돼 있었음), 스캔 조건에서만 이미 처리된 행을 걸러내지
-- 않은 것이 원인이었다(실측: 캠핑장 중분류 첫 페이지 50건 중 10건이 이미
-- group_id가 있는 행이었음을 직접 확인).
--
-- 수정: 두 모드 모두에 `and group_id is null`을 추가한다. 이미 그룹으로
-- 확정된 행은 (a) 새로 들어오는 동일 좌표 행의 자동 편입은
-- auto_assign_open_spaces_to_existing_groups가 이미 처리하고, (b) 그
-- 그룹을 다시 열어 수정하고 싶으면 관리자가 스팟 상세의 "🔗 중복 스팟
-- 검토"로 직접 열람 가능하므로, 이 1차 스캔 후보 목록에서는 반복 노출할
-- 필요가 없다.
create or replace function public.find_spot_dedup_candidates(
  p_limit integer default 50,
  p_after_key text default null,
  p_service_category_id uuid default null
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
      where %s
        and group_id is null
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
    case
      when p_service_category_id is null then 'service_category_id is null'
      else format('service_category_id = %L', p_service_category_id)
    end,
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
