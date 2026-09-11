-- [개선사항10: Event↔Spot 자동 매칭](2026-09-11 사용자 지시, implementation/todo.md):
-- "이벤트 수집 시 장소 매칭 로직을 두어, 일치하는 상설 스팟이 있으면 자동 매칭"
-- events.space_id는 이미 존재하는 FK 컬럼(events_space_id_fkey → open_spaces(id))인데
-- 지금까지 어떤 수집 어댑터도 채운 적이 없어(실측 확인: scripts/ingest 전체에서
-- space_id를 다루는 코드가 전혀 없음) 전량 NULL이다. 매 수집 어댑터를 개별
-- 수정하는 대신(20개 이상, 회귀 위험 큼), 좌표 근접 + 이름 부분 일치라는 보수적인
-- 기준으로 한 번에 매칭하는 배치 스크립트를 둔다 — space_id가 NULL인 이벤트만
-- 대상이라 몇 번을 다시 실행해도 이미 연결된 것을 건드리지 않는다(멱등, 신규
-- 이벤트가 쌓일 때마다 재실행 가능).
--
-- [매칭 기준] 잘못된 링크가 링크 없음보다 나쁘다는 원칙 아래(관리자 수동 지정이
-- 최종 폴백으로 이미 준비돼 있음, 개선사항10 요구사항 자체), 두 조건을 모두
-- 만족해야만 연결한다:
--   1) 좌표가 30m 이내(같은 건물/부지로 볼 수 있는 거리 — find_nearby_open_spaces
--      RPC의 "중복 스팟 검토" 기본 반경 30m와 동일 기준 재사용, 제5장 제4조).
--   2) 이름(venue_name ↔ open_spaces.name)이 서로 부분 문자열로 겹친다(완전
--      동일 요구가 아니라 "서울숲 다목적운동장"↔"서울숲" 같은 부분 표기 차이를
--      허용하되, 이름이 전혀 다른 우연한 근접 시설끼리 잘못 묶이는 것은 막는다).
-- 한 이벤트에 여러 후보가 매칭되면 가장 가까운 1건만 선택한다.
with matched as (
  select distinct on (e.id)
    e.id as event_id,
    o.id as space_id
  from public.events e
  join public.open_spaces o
    on e.location is not null
    and o.location is not null
    and ST_DWithin(e.location::geography, o.location::geography, 30)
    and (
      o.name ilike '%' || regexp_replace(trim(e.venue_name), '[()%_]', '', 'g') || '%'
      or trim(e.venue_name) ilike '%' || regexp_replace(o.name, '[()%_]', '', 'g') || '%'
    )
  where e.space_id is null
    and e.venue_name is not null
    and length(trim(e.venue_name)) >= 2
  order by e.id, ST_Distance(e.location::geography, o.location::geography)
)
update public.events e
set space_id = matched.space_id
from matched
where e.id = matched.event_id;
