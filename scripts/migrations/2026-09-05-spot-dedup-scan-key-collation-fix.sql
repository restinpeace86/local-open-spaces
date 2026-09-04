-- [중복 스팟 탐지 — geohash 스캔 순서 실측 재검증 중 발견한 두 번째 버그](2026-09-05)
-- 앞선 마이그레이션(2026-09-05-spot-dedup-geohash-scan-and-accurate-distance.sql)
-- 적용 직후 실제 RPC 호출로 재검증하는 과정에서, location이 없는 행(대체 키
-- `'~' || id::text`)이 유효한 geohash를 가진 행보다 **먼저** 정렬되는 것을 실측으로
-- 발견했다 — 의도(모든 geohash 문자보다 사전순으로 뒤에 오는 문자로 밀어내기)와
-- 정반대였다.
--
-- 원인: 이 데이터베이스의 기본 콜레이션(`en_US.UTF-8`, `datcollate`로 확인)에서는
-- `'~' < 'a'`가 **true**다 — glibc의 로케일 인식 정렬 규칙이 특수문자를 영숫자보다
-- 앞에 두기 때문이다(순수 바이트/ASCII 비교라면 '~'(126)가 'a'(97)보다 커서 뒤에
-- 와야 함). 직접 확인: `select '~' < 'a'` → true(기본 콜레이션), `select ('~' collate
-- "C") < ('a' collate "C")` → false(C 콜레이션, 순수 바이트 비교).
--
-- 해결: 정렬/커서 비교에 `collate "C"`를 명시해 로케일과 무관하게 항상 순수 바이트
-- 순서로 비교하도록 강제한다. 인덱스도 이 콜레이션에 맞춰 다시 만든다(인덱스가
-- 만들어질 때 쓰인 콜레이션과 쿼리의 콜레이션이 다르면 인덱스를 못 쓰고 다시
-- 느려진다 — 어제/오늘 반복해서 배운 "실측 확인" 원칙 그대로).
drop index if exists public.idx_open_spaces_dedup_scan_key;
create index idx_open_spaces_dedup_scan_key
  on public.open_spaces ((coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) collate "C"))
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
      case when location is not null then ST_Y(location::geometry) end as lat,
      case when location is not null then ST_X(location::geometry) end as lng,
      (coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) collate "C") as scan_key
    from public.open_spaces
    where service_category_id is null
      and (
        p_after_key is null
        or (coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) collate "C") > (p_after_key collate "C")
      )
    order by (coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) collate "C")
    limit p_limit
  )
  select jsonb_build_object(
    'candidates', coalesce((select jsonb_agg(to_jsonb(s) - 'scan_key') from scanned s), '[]'::jsonb),
    'next_cursor', (select scan_key from scanned order by scan_key collate "C" desc limit 1),
    'has_more', (select count(*) from scanned) = p_limit
  );
$$;
