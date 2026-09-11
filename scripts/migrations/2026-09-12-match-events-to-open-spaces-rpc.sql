-- [개선사항10 후속: Event↔Spot 자동 매칭을 매일 배치에 상시 편입](2026-09-12 사용자 지시):
-- "이미 등록한 적 있는데 일자만 바뀌는 이벤트들(한강공원 난지캠핑장, 서울형 키즈카페 등).
-- 내가 이전 8월꺼에 대하여 스팟연결하고 노출 중분류도 해놨는데.. 9월꺼 가져왔으면 자동
-- 매핑같은거 가능한가?" — 실측 확인 결과 이미 존재하는 스팟(external_id가 안정적인
-- 다수 소스)은 SafeMerge가 space_id를 그대로 보존해 문제없이 유지된다. 문제는
-- external_id가 매달 새로 발급되는 소스(예: "한성백제박물관점 9월 운영 안내"처럼 SVCID
-- 자체가 달마다 바뀌는 경우) — DB 입장에선 완전히 새 행이라 space_id가 처음부터 NULL로
-- 시작하고, 관리자가 8월 건에 해둔 스팟 연결(및 그 스팟의 노출 중분류)이 자동으로
-- 이어지지 않는다.
--
-- 2026-09-11-match-events-to-open-spaces.sql(Step 114, 개선사항10)에서 이미 "좌표 30m
-- 이내 + 이름 부분일치, space_id가 NULL인 것만 대상 → 멱등, 재실행 가능"이라는 정확히
-- 맞는 로직을 한 번 수동 실행한 적이 있다 — 이번 요청은 그 로직 자체를 새로 만드는 게
-- 아니라, 매번 관리자가 손으로 재실행하지 않아도 되도록 그 SQL을 RPC 함수로 만들어
-- run-daily.mjs(매일 배치)의 후처리 단계에 편입하는 것이다(제5장 제4조 기존 구조
-- 우선 — 매칭 기준/조건은 그대로 재사용, 실행 방식만 자동화).
--
-- [노출 중분류는 별도로 옮길 필요가 없다] service_category_id는 events가 아니라
-- open_spaces 쪽 컬럼이다 — 새 이벤트가 "이미 노출 중분류를 설정해 둔 그 스팟"에
-- space_id로 연결되기만 하면, 노출 중분류는 그 스팟 자체에 이미 있으므로 자동으로
-- "따라온다"(같은 스팟 행을 가리킬 뿐 별도로 복사할 값이 없음).
create or replace function public.match_events_to_open_spaces()
returns integer
language plpgsql
as $$
declare
  v_updated_count integer;
begin
  with matched as (
    select distinct on (e.id)
      e.id as event_id,
      o.id as space_id
    from public.events e
    join public.open_spaces o
      on e.location is not null
      and o.location is not null
      and st_dwithin(e.location::geography, o.location::geography, 30)
      and (
        o.name ilike '%' || regexp_replace(trim(e.venue_name), '[()%_]', '', 'g') || '%'
        or trim(e.venue_name) ilike '%' || regexp_replace(o.name, '[()%_]', '', 'g') || '%'
      )
    where e.space_id is null
      and e.venue_name is not null
      and length(trim(e.venue_name)) >= 2
    order by e.id, st_distance(e.location::geography, o.location::geography)
  )
  update public.events e
  set space_id = matched.space_id
  from matched
  where e.id = matched.event_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;
