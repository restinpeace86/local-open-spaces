-- [노출 중분류별 중복 스팟 검수 + 기존 그룹 자동 편입](2026-09-09 사용자 지시):
-- "각 노출중분류별 중복 스팟 검수 가능하도록 중복 스팟 검수 및 매핑 탭에
-- 변경해줘.... 먼저 노출중분류 선택하고 거기 있는 데이터들끼리만 좌표
-- 비교해서 중복 스팟 있는지 확인하는거 / 일단 중복되는 것에 대하여
-- 대표스팟을 만들고 추후에 들어온 데이터들도 동일 좌표면 대표스팟내로
-- 묶이는걸로 하자"

-- 1) find_spot_dedup_candidates: 노출 중분류(p_service_category_id) 지정 시
-- 그 중분류로 이미 매핑된 행끼리만 스캔한다. 지정하지 않으면(NULL, 기본값)
-- 기존 동작(service_category_id IS NULL — 아직 매핑되지 않은 원본 전체
-- 스캔) 그대로 유지한다 — 관리자가 "중분류로 매핑하기 전" 원본 데이터를
-- 정리하던 기존 워크플로우를 없애지 않는다(제5장 제4조 기존 구조 우선).
-- 카테고리 지정 스캔은 전체 스캔 대비 대상 행 수가 훨씬 적어(실측: 가장 큰
-- 카테고리도 2,302건) 기존 geohash 페이지네이션 없이도 한 번에 스캔 가능한
-- 경우가 많지만, 인터페이스 일관성을 위해 커서 파라미터는 그대로 둔다.
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
    -- 노출 중분류 지정 여부에 따라 스캔 모집단 자체를 바꾼다(리터럴 삽입 —
    -- p_service_category_id는 uuid 타입 파라미터라 quote_literal 없이
    -- %L로 안전하게 이스케이프한다).
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

-- 2) auto_assign_open_spaces_to_existing_groups: 이미 사람이 검수해 확정한
-- 그룹(open_spaces.group_id)의 좌표 30m 이내에 새로 들어온(daily batch)
-- 미그룹 행이 있으면 그 그룹으로 자동 편입한다 — "새로운 자동 중복 판정
-- 로직"이 아니라 "이미 사람이 한 번 확인한 좌표에 한해서만" 적용되므로
-- dedupe-open-spaces.mjs가 단일 출처 반복을 자동 판정 대상에서 제외한 것과
-- 같은 신중함(추측 금지, 제3장 제5조)을 지킨다. 30m는 이 그룹들을 만들 때
-- 이미 쓴 것과 동일한 반경(find_nearby_open_spaces PROXIMITY_THRESHOLD_METERS,
-- spot-dedup-grouping.ts)이라 새 임계값을 만들지 않았다.
create or replace function public.auto_assign_open_spaces_to_existing_groups()
returns integer
language plpgsql
as $$
declare
  v_updated_count integer;
begin
  with anchors as (
    -- 그룹당 대표 좌표 1개(최초 생성 멤버) — 그룹 내 모든 멤버는 이미 서로
    -- 30m 이내로 확인된 상태라 어느 멤버를 기준으로 잡아도 판정 결과는 같다.
    select distinct on (group_id)
      group_id, location, standard_name, service_category_id, blog_url, age_group, feature_tag
    from public.open_spaces
    where group_id is not null and location is not null
    order by group_id, created_at asc
  ),
  matches as (
    -- 미그룹 행 중 가장 가까운 앵커(그룹) 하나에만 배정한다 — 드물게 서로 다른
    -- 두 그룹의 30m 반경이 겹치는 경우를 대비한 안전장치.
    select distinct on (s.id)
      s.id, a.group_id, a.standard_name, a.service_category_id, a.blog_url, a.age_group, a.feature_tag
    from public.open_spaces s
    join anchors a
      on s.group_id is null
      and s.location is not null
      and st_dwithin(s.location::geography, a.location::geography, 30)
    order by s.id, st_distance(s.location::geography, a.location::geography) asc
  )
  update public.open_spaces s
  set
    group_id = m.group_id,
    standard_name = m.standard_name,
    service_category_id = m.service_category_id,
    blog_url = m.blog_url,
    age_group = m.age_group,
    feature_tag = m.feature_tag
  from matches m
  where s.id = m.id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;
