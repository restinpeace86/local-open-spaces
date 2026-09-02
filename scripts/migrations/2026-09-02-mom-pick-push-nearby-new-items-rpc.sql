-- [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.5: 우수맘 이상 푸시
-- 발송 배치(scripts/ingest/mom-pick-push-send-batch.mjs)가 "구독자 위치 반경 내에서 최근
-- 새로 올라온 스팟/행사가 있는지"를 세야 한다. 기존 get_nearby_spaces_and_events RPC는
-- created_at을 반환하지 않고(반환 컬럼에 없음) 다수의 화면(스팟픽/이벤트픽/AI 챗봇)이
-- 이미 그 정확한 시그니처에 의존하고 있어, 그 RPC를 건드리는 대신 이 목적 전용의 새
-- RPC를 별도로 둔다(제5장 제4조 기존 구조 우선의 취지는 "다른 목적을 억지로 통합"이
-- 아니라 이미 이 세션에서 curated_items/spot_curations 패널에도 적용한 원칙과 동일).
create or replace function public.count_new_nearby_items(
  user_lng double precision,
  user_lat double precision,
  radius_meters int,
  since_timestamp timestamptz
)
returns int
language sql
stable
as $$
  select (
    (
      select count(*) from public.open_spaces s
      where s.location_precision = 'EXACT'
        and s.created_at >= since_timestamp
        and st_dwithin(s.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
    ) + (
      select count(*) from public.events e
      where e.is_active = true
        and e.location_precision = 'EXACT'
        and e.created_at >= since_timestamp
        and st_dwithin(e.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography, radius_meters)
    )
  )::int;
$$;

revoke all on function public.count_new_nearby_items(double precision, double precision, int, timestamptz) from public, anon, authenticated;
grant execute on function public.count_new_nearby_items(double precision, double precision, int, timestamptz) to service_role;
