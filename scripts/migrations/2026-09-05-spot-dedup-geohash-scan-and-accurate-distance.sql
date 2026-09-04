-- [중복 스팟 탐지 정확도 개선](2026-09-05 사용자 지시) 사용자가 실제 데이터로 직접
-- 지적한 3개 사례를 실측으로 재현·검증한 결과, 두 가지 독립된 근본 원인을 확인했다:
--
-- 1) **탐지 로직 자체의 정확도 문제**: "물빛어린이공원 바닥분수"~"판교제2호(물빛)공원"
--    (실제 26.2m, `ST_Distance(geography)`로 직접 확인)이 기존 eps=0.00027도(≈30m
--    "근사치") 임계값을 근소하게 벗어나 놓쳤다 — 위경도를 degree 단위 그대로 유클리드
--    거리로 비교하면 위도에 따라 경도 1도가 나타내는 실제 거리가 달라져(이 위도 37도
--    부근에서는 경도 방향 오차가 더 크게 작용) 부정확하다. **정확한 실제 미터 거리가
--    필요하면 `geography` 타입 거리 계산이 정답**이다.
-- 2) **더 치명적인 원인 — 페이지네이션 순서 문제**: "성남시운중도서관"~"운중도서관
--    시청각실"(실제 6.9m)과 "판교원마을3단지 산오름놀이터"~"판교원마을3단지
--    유아놀이터"(좌표·주소 완전히 동일)처럼 명백한 중복조차 놓쳤다 — 원인은 거리
--    계산이 아니라, 어제(2026-09-04) 도입한 페이지네이션이 `id`(사실상 무작위인
--    uuid) 순으로 스캔해, 실제로 가까운 두 행이 같은 배치(50건)에 함께 걸릴 확률이
--    142,113건 중 사실상 0에 가까웠다는 것이다(ST_GeoHash로 실측 확인: 이 세 쌍
--    전부 geohash 앞자리가 7~9자리까지 동일하거나 거의 동일 — 공간적으로는 이미
--    매우 가깝지만 id 순서상으로는 전혀 무관한 위치에 흩어져 있었다).
--
-- **해결책**: 스캔 순서를 `id`가 아니라 **ST_GeoHash 기반 공간 순서**로 바꾼다 —
-- 가까운 위치의 행들이 자연스럽게 인접한 순서로 스캔되어, 몇 번의 "더 보기"만으로도
-- 같은 배치(또는 인접 배치)에 함께 걸릴 가능성이 크게 높아진다. 좌표 근접 판정
-- 자체도 이 마이그레이션에서는 서버가 배치 내부에서 미리 계산해주지 않고, 스캔된
-- 원시 좌표(lat/lng)만 그대로 클라이언트에 전달한다 — 실제 그룹 병합은 클라이언트가
-- **누적된 전체 후보**를 대상으로 정확한 Haversine 공식(실제 지구 반지름 기준 미터
-- 거리)으로 다시 계산한다(spot-dedup-grouping.ts) — 이렇게 하면 어느 배치 경계에서
-- 잘리더라도 일단 두 번 다 스캔만 되면(geohash 순서 덕에 훨씬 쉬워짐) 정확하게
-- 합쳐진다. 서버 쪽 SQL은 다시 단순해져 유지보수가 쉬워진다는 부수 효과도 있다
-- (어제 겪은 쿼리 플래너 오판/타임아웃 사고 같은 리스크 표면적이 줄어듦).

-- 1. geohash 기반 스캔 순서를 인덱스로 뒷받침한다(어제와 동일한 교훈 — 통계/인덱스
-- 없이 계산식을 정렬 기준으로 쓰면 매번 전체 스캔이 될 위험이 크다). location이
-- 없는 행은 실제 좌표가 없어 geohash를 만들 수 없으므로, 유효한 geohash보다 항상
-- 뒤로 정렬되도록 '~'(어떤 geohash 문자보다도 사전순으로 뒤에 오는 문자)로 시작하는
-- 대체 키를 쓴다.
drop index if exists public.idx_open_spaces_dedup_scan_key;
create index idx_open_spaces_dedup_scan_key
  on public.open_spaces ((coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text)))
  where service_category_id is null;

-- 2. RPC 재정의 — 반환 스키마가 바뀌어(proximity_cluster_id 제거, scan_key를 커서로
-- 사용) CREATE OR REPLACE로 덮어쓸 수 없어 DROP 후 재생성한다. 좌표 근접 계산 자체를
-- 이 함수에서 제거했으므로 p_eps_degrees 파라미터도 더 이상 필요 없다.
drop function if exists public.find_spot_dedup_candidates(double precision, integer, uuid);

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
      coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) as scan_key
    from public.open_spaces
    where service_category_id is null
      and (
        p_after_key is null
        or coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text) > p_after_key
      )
    order by coalesce(ST_GeoHash(location::geometry, 9), '~' || id::text)
    limit p_limit
  )
  select jsonb_build_object(
    -- scan_key는 순전히 내부 커서 용도라 응답 페이로드에서는 제외한다.
    'candidates', coalesce((select jsonb_agg(to_jsonb(s) - 'scan_key') from scanned s), '[]'::jsonb),
    'next_cursor', (select scan_key from scanned order by scan_key desc limit 1),
    'has_more', (select count(*) from scanned) = p_limit
  );
$$;
