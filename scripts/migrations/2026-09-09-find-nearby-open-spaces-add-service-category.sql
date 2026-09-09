-- [노출 중분류 경계 넘는 오묶음 방지](2026-09-09 사용자 지시): "그룹을 열 때마다
-- 각 멤버 기준으로 실제 반경(30m)을 다시 조회.. 이부분에서 같은 노출중분류에
-- 대하여서만 하는거 맞아?" — 실측 확인 결과 아니었다. find_nearby_open_spaces는
-- 좌표 30m 반경만 볼 뿐 service_category_id를 전혀 고려하지 않아, 그룹 오픈 시
-- 보강 조회([[2026-09-09-dedup-scan-page-size-and-group-enrichment]])가 완전히
-- 다른 노출 중분류(또는 미매핑)의 무관한 스팟을 그룹에 끌어들일 수 있었다 —
-- 체크박스가 기본 체크 상태라 관리자가 놓치면 그 무관한 스팟의 service_category_id
-- 까지 잘못 덮어쓸 위험이 있었다.
--
-- 이 RPC는 SpotDedupQuickModal("open_spaces 상세에서 중복 스팟 검토")과
-- MobileCurationWorkbench("1단: 중복 장소 검수 배너")도 공유하는데, 그 두 곳은
-- "이 스팟과 실제로 같은 장소인 걸 좌표만으로 찾기"가 목적이라 노출 중분류로
-- 제한하면 안 된다(아직 매핑 안 된 진짜 중복도 찾아야 함) — 그래서 RPC 자체에
-- 강제 필터를 넣지 않고, 응답에 service_category_id만 추가해 호출부
-- (spot-dedup-panel.tsx)가 스캔 범위에 맞게 직접 걸러내도록 한다.
create or replace function public.find_nearby_open_spaces(
  p_spot_id uuid,
  p_radius_meters integer default 30,
  p_limit integer default 50
)
returns jsonb
language sql
stable
as $$
  with target as (
    select id, location
    from public.open_spaces
    where id = p_spot_id
  ),
  nearby as (
    select
      o.id,
      o.name,
      o.category,
      o.category_min,
      o.address,
      o.service_category_id,
      round(ST_Distance(o.location::geography, t.location::geography)::numeric) as distance_m
    from public.open_spaces o, target t
    where o.id <> t.id
      and t.location is not null
      and o.location is not null
      and ST_DWithin(o.location::geography, t.location::geography, p_radius_meters)
    order by ST_Distance(o.location::geography, t.location::geography)
    limit p_limit
  )
  select coalesce(jsonb_agg(to_jsonb(nearby)), '[]'::jsonb) from nearby;
$$;
