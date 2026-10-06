-- [문화센터 통합 화면 — 위치 기준 정렬](2026-10-07 사용자 지시): "본인 위치
-- 기준으로 가까운 것부터 보여줄꺼야" — culture_club_classes는 좌표를 직접
-- 갖고 있지 않고 store_code로 open_spaces(EMART_STORE_*/LOTTEMART_STORE_*)
-- 를 가리킨다. 기존 get_nearby_spaces_and_events RPC는 external_id를
-- 반환하지 않아(다른 많은 기능이 의존하는 복잡한 함수라 그걸 건드리는 대신)
-- 문화센터 지점 전용의 작고 독립적인 RPC를 새로 만든다 — external_id →
-- (lng, lat) 매핑만 돌려준다(124개뿐이라 매 요청마다 전부 가져와도 가볍다).
create or replace function public.get_culture_club_store_coordinates()
returns table(external_id text, lng double precision, lat double precision)
language sql
stable
as $$
  select external_id, st_x(location) as lng, st_y(location) as lat
  from public.open_spaces
  where category_min = '대형마트문화센터'
    and location is not null;
$$;
