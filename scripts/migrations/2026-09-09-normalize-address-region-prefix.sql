-- [주소 정규화 — 광역 표기 장/단축형 통일](2026-09-09 사용자 지시): "저 버그
-- 고쳤어?" — 실측 사례: "플로렌스 글램핑"(경기도 가평군 북면 보안벚꽃길 54)과
-- "플로렌스 글램핑 & 캠핑"(경기 가평군 북면 보안벚꽃길 54)은 같은 곳인데 앞
-- 광역 표기만 "경기도"/"경기"로 달라 normalized_address 완전일치 판정에 걸리지
-- 않았다(이번 사례는 좌표가 30m 이내라 GPS 근접 판정으로 우연히 잡혔을 뿐,
-- 좌표가 부정확하거나 없는 다른 데이터였다면 놓쳤을 것이다).
--
-- [설계] 광역 표기를 통째로 지우지 않고 **단축형으로 통일**한다("경기도"→"경기",
-- "서울특별시"→"서울" 등). 통째로 지우면 "서울 중구.."와 "부산 중구.."처럼 서로
-- 다른 광역시의 동일 구/동/도로명이 우연히 같은 문자열로 뭉쳐 오묶음(false
-- positive)을 만들 위험이 있다(제3장 제5조 추측 금지 — 근거 없는 위험을 새로
-- 만들지 않는다) — 단축형 통일은 광역 단위 구분은 그대로 유지하면서 표기
-- 차이만 없앤다.
create or replace function public.normalize_address_region_prefix(addr text)
returns text
language plpgsql
immutable
as $$
declare
  mapping text[][] := array[
    ['서울특별시', '서울'], ['부산광역시', '부산'], ['대구광역시', '대구'], ['인천광역시', '인천'],
    ['광주광역시', '광주'], ['대전광역시', '대전'], ['울산광역시', '울산'], ['세종특별자치시', '세종'],
    ['경기도', '경기'],
    ['강원특별자치도', '강원'], ['강원도', '강원'],
    ['충청북도', '충북'], ['충청남도', '충남'],
    ['전북특별자치도', '전북'], ['전라북도', '전북'], ['전라남도', '전남'],
    ['경상북도', '경북'], ['경상남도', '경남'],
    ['제주특별자치도', '제주'], ['제주도', '제주']
  ];
  result text := addr;
  pair text[];
begin
  if result is null then
    return null;
  end if;
  foreach pair slice 1 in array mapping loop
    if left(result, length(pair[1])) = pair[1] then
      result := pair[2] || substring(result from length(pair[1]) + 1);
      exit; -- 주소 맨 앞 광역 표기는 하나뿐이라 한 번 매칭되면 더 볼 필요 없다.
    end if;
  end loop;
  return result;
end;
$$;

-- find_spot_dedup_candidates: normalized_address 계산에 위 정규화를 앞단에 끼운다
-- (공백 제거보다 먼저 — 광역 표기 매칭이 원본 띄어쓰기 기준이어야 정확하다).
-- 그 외 본문은 2026-09-09-exclude-grouped-rows-from-dedup-scan.sql과 동일하다.
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
            regexp_replace(coalesce(public.normalize_address_region_prefix(address), ''), '[[:space:]]', '', 'g'),
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
