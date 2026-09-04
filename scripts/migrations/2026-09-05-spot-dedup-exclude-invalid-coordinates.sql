-- [중복 스팟 탐지 — geohash 스캔 순서 실측 재검증 중 발견한 세 번째 문제](2026-09-05)
-- 앞선 두 마이그레이션 적용 후 실제 RPC를 다시 호출해 결과를 직접 확인하는 과정에서,
-- 지리적으로 명백히 잘못된 좌표(위도 19.69, 경도 117.99 — 한국이 아니라 남중국해
-- 부근, 실제 주소는 서울/부산/제주 등 전국 각지)를 공유하는 행이 37건(그중 32건은
-- 사실상 동일한 하나의 placeholder 좌표) 있음을 실측으로 확인했다. 이 값을 진짜
-- 좌표처럼 취급하면 두 가지 문제가 생긴다:
-- ① geohash 정렬 순서상 이 값이 실제 한국 좌표(geohash 'w'로 시작)보다 앞서
--    나열되어, 관리자가 몇 페이지를 넘기든 서로 무관한 이 잘못된 좌표 행들만
--    계속 보게 되고 진짜 중복 후보는 계속 뒤로 밀린다.
-- ② 클라이언트가 정확한 Haversine 거리로 재계산할 때 "완전히 같은 좌표"로 잡혀,
--    실제로는 전혀 무관한(주소도 다르고 실제 위치도 다른) 32건이 하나의 거대한
--    "중복 의심 그룹"으로 잘못 묶인다.
--
-- 해결: 대한민국의 실제 위경도 범위(위도 33~39도, 경도 124~132도 — 제주도~극북 국경
-- 지역까지 넉넉히 포함하는 바운딩 박스)를 벗어나는 좌표는 "위치 정보 없음(NULL)"과
-- 동일하게 취급한다 — geohash 스캔 순서에서는 id 기반 대체 키로 뒤로 밀리고, 클라이언트
-- 좌표 근접 판정에서도 애초에 lat/lng를 null로 돌려줘 제외된다. 이 데이터 자체의 잘못된
-- 좌표를 고치는 것은 이 작업의 범위가 아니다(원천 데이터/지오코딩 파이프라인 문제 —
-- 별도 확인이 필요하며 추측으로 고치지 않는다) — 여기서는 "중복 탐지 도구가 이 pre-
-- existing 데이터 결함에 오염되지 않도록" 방어만 한다.
drop index if exists public.idx_open_spaces_dedup_scan_key;
create index idx_open_spaces_dedup_scan_key
  on public.open_spaces (
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
    )
  )
  where service_category_id is null;

drop function if exists public.find_spot_dedup_candidates(integer, text);

create or replace function public.find_spot_dedup_candidates(
  p_limit integer default 50,
  p_after_key text default null
)
returns jsonb
language sql
stable
as $$
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
      -- 대한민국 바운딩 박스(위도 33~39, 경도 124~132)를 벗어나는 좌표는 위치 정보가
      -- 없는 것과 동일하게 취급한다(위 주석 참고 — 실측으로 확인된 잘못된 placeholder
      -- 좌표 37건 방어).
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
      and (
        p_after_key is null
        or (
          coalesce(
            case
              when location is not null
                and ST_Y(location::geometry) between 33 and 39
                and ST_X(location::geometry) between 124 and 132
              then ST_GeoHash(location::geometry, 9)
            end,
            '~' || id::text
          ) collate "C"
        ) > (p_after_key collate "C")
      )
    order by scan_key
    limit p_limit
  )
  select jsonb_build_object(
    'candidates', coalesce((select jsonb_agg(to_jsonb(s) - 'scan_key') from scanned s), '[]'::jsonb),
    'next_cursor', (select scan_key from scanned order by scan_key collate "C" desc limit 1),
    'has_more', (select count(*) from scanned) = p_limit
  );
$$;
