-- [개선사항10] "주소 표준화 및 좌표 기반 그룹핑" 후보 조회 RPC(2026-09-04 todo.md).
--
-- 142,113건(실측)에 달하는 open_spaces 전체를 애플리케이션 레벨에서 O(n^2)로 좌표
-- 비교하면 명백히 감당 불가능하다 — PostGIS 내장 윈도우 함수 ST_ClusterDBSCAN으로
-- "좌표 기준 반경 이내 밀집 스팟"을 DB 안에서 한 번에 계산한다(장표 3단계: "좌표 기준
-- 반경 20~30m 이내 밀집 스팟 탐지"). eps 기본값 0.00027도는 위도 37도(대한민국 중부)
-- 부근에서 약 30m에 해당하는 근사치다(정밀한 미터 단위 변환이 아니라 실용적 근사 —
-- 정확한 미터 거리가 필요하면 추후 geography 타입의 ST_DWithin으로 교체 가능).
--
-- 두 가지 서로 다른 "중복 의심" 기준(주소 정규화 일치 / 좌표 근접)을 하나로 합치는
-- 일(Union-Find로 연결된 그룹 만들기)은 SQL보다 애플리케이션 코드가 다루기 쉬워
-- (src/lib/admin/spot-dedup-grouping.ts), 이 RPC는 "후보가 되는 행 목록 + 각 행이
-- 속한 근접 클러스터 번호 + 정규화 주소"까지만 돌려주고 최종 그룹 병합은 API 라우트가
-- 담당한다.
--
-- p_limit: 정제되지 않은 행이 매우 많을 수 있어(실측 142,113건) 한 번에 전부 처리하지
-- 않는다 — id 순으로 최대 p_limit건만 후보로 삼는다(안정적, 결정론적 순서). 관리자가
-- 그룹을 처리(service_category_id 채움)할 때마다 그 행들이 다음 조회에서 자동으로
-- 빠지므로, 반복 호출로 점진적으로 전체를 훑을 수 있다 — "한 번에 완벽한 전수 그룹핑"이
-- 아니라 "점진적 관리자 검수 큐"로 설계한 것이며 이는 의도된 트레이드오프다.
create or replace function public.find_spot_dedup_candidates(
  p_eps_degrees double precision default 0.00027,
  p_limit integer default 3000
)
returns table (
  id uuid,
  name character varying,
  category character varying,
  category_min text,
  address text,
  normalized_address text,
  lat double precision,
  lng double precision,
  proximity_cluster_id integer
)
language sql
stable
as $$
  with candidates as (
    select
      o.id,
      o.name,
      o.category,
      o.category_min,
      o.address,
      -- 요구사항 그대로: 공백 제거 → '번지'/'층'/'호' 제거 → 나머지 특수문자 제거.
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(o.address, ''), '[[:space:]]', '', 'g'),
          '(번지|층|호)', '', 'g'
        ),
        '[^가-힣0-9a-zA-Z]', '', 'g'
      ) as normalized_address,
      case when o.location is not null then ST_Y(o.location::geometry) end as lat,
      case when o.location is not null then ST_X(o.location::geometry) end as lng,
      case when o.location is not null
        then ST_ClusterDBSCAN(o.location::geometry, eps := p_eps_degrees, minpoints := 2) over ()
      end as proximity_cluster_id
    from (
      select *
      from public.open_spaces
      where service_category_id is null
      order by id
      limit p_limit
    ) o
  ),
  address_dupe_keys as (
    select normalized_address
    from candidates
    where normalized_address <> ''
    group by normalized_address
    having count(*) > 1
  )
  select c.id, c.name, c.category, c.category_min, c.address, c.normalized_address, c.lat, c.lng, c.proximity_cluster_id
  from candidates c
  where c.proximity_cluster_id is not null
     or c.normalized_address in (select normalized_address from address_dupe_keys);
$$;
