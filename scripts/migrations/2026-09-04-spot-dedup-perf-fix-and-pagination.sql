-- [관리자 중복 스팟 검수 탭 — timeout 신고 대응](2026-09-04 사용자 지시) "중복 의심
-- 그룹 데이터 너무 많나봐 또 timeout 걸리네.. 50여건씩 pagination 하던가..."
--
-- [실측으로 확인한 진짜 원인] 신고를 받고 EXPLAIN (ANALYZE, BUFFERS)로 직접 재현한
-- 결과, 문제는 클러스터링 계산량이 아니라 **open_spaces 테이블 통계 정보가 낡아서
-- 생긴 쿼리 플래너의 오판**이었다. `service_category_id is null` 조건은 실제로
-- 142,113건 전부(중분류 매핑이 하나도 안 된 초기 상태)에 해당하는데, 낡은 통계는
-- 이를 711건으로 추정해 플래너가 "Bitmap Heap Scan"(추정만큼만 훑으면 됨을 전제)을
-- 선택했다 — 실제로는 사실상 전체 힙(30,489블록)을 훑어야 해서 단순
-- `... limit 500` 하나에도 13.5초가 걸렸다(재현: `EXPLAIN ANALYZE`로 직접 확인).
-- `ANALYZE open_spaces;`로 통계를 갱신하자 플래너가 즉시 `Index Scan using
-- open_spaces_pkey`(정렬된 id 순으로 훑다가 500개 채우면 조기 종료)로 바뀌어 같은
-- 쿼리가 **457ms**로, 전체 RPC(클러스터링 포함, limit=3000)는 **110ms**로
-- 떨어졌다(EXPLAIN ANALYZE 재확인 완료 — 이 개선 자체는 이 파일 실행과 별개로
-- 이미 운영 DB에 `ANALYZE open_spaces;`를 직접 실행해 반영해 두었다).
--
-- 다만 이 근본 원인이 다시 재발할 수 있고(테이블이 계속 갱신되는데 autovacuum이
-- 통계 갱신을 따라가지 못하면 동일 증상 재발 가능), 사용자가 명시적으로
-- "50여건씩 페이지네이션"을 요청했으므로 방어적으로 함께 적용한다: 커서(id) 기반
-- 페이지네이션을 추가해 한 번의 호출이 항상 작은 배치(기본 50건)만 스캔하도록
-- 강제한다 — 통계가 다시 낡아지더라도 한 번에 스캔하는 행 수 자체가 작아 피해가
-- 제한적이다.
--
-- [반환 타입 변경 — TABLE → jsonb] 기존 TABLE 반환 방식은 "이번 배치에 후보가
-- 0건이었지만 스캔 자체는 끝까지 진행했다"는 상태를 표현할 방법이 없다(0행이면
-- 그냥 빈 결과와 구분이 안 됨 → 다음 페이지로 넘어갈 커서를 어디서도 알 수 없어
-- 진행이 멈춰버린다). candidates 배열 + next_cursor(이번 배치가 실제로 스캔한
-- 마지막 id) + has_more(이번 배치가 p_limit을 꽉 채웠는지 — 다음 페이지 존재 여부)를
-- 한 번에 담은 jsonb 객체로 반환하도록 바꾼다. 기존 함수는 반환 타입 자체가 달라져
-- CREATE OR REPLACE로 덮어쓸 수 없어 DROP 후 재생성한다.
drop function if exists public.find_spot_dedup_candidates(double precision, integer);

create or replace function public.find_spot_dedup_candidates(
  p_eps_degrees double precision default 0.00027,
  p_limit integer default 50,
  p_after_id uuid default null
)
returns jsonb
language sql
stable
as $$
  with scanned as (
    select *
    from public.open_spaces
    where service_category_id is null
      and (p_after_id is null or id > p_after_id)
    order by id
    limit p_limit
  ),
  candidates as (
    select
      o.id,
      o.name,
      o.category,
      o.category_min,
      o.address,
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
    from scanned o
  ),
  address_dupe_keys as (
    select normalized_address
    from candidates
    where normalized_address <> ''
    group by normalized_address
    having count(*) > 1
  ),
  filtered as (
    select c.id, c.name, c.category, c.category_min, c.address, c.normalized_address, c.lat, c.lng, c.proximity_cluster_id
    from candidates c
    where c.proximity_cluster_id is not null
       or c.normalized_address in (select normalized_address from address_dupe_keys)
  )
  select jsonb_build_object(
    'candidates', coalesce((select jsonb_agg(to_jsonb(f)) from filtered f), '[]'::jsonb),
    -- uuid는 max() 집계가 없어(자연스러운 정렬 연산자가 없음), scanned가 이미 id
    -- 오름차순으로 정렬돼 있다는 점을 이용해 마지막 행을 직접 뽑는다.
    'next_cursor', (select id::text from scanned order by id desc limit 1),
    'has_more', (select count(*) from scanned) = p_limit
  );
$$;
