-- [백화점 문화센터 신규 표준중분류/노출중분류 등록](2026-10-08 사용자 지시):
-- "문화센터 화면에서 신세계 문화센터꺼는 아직 안보이는데?" — 원인은
-- culture_club_classes가 store_code로 open_spaces의 좌표를 참조하는데
-- (get_culture_club_store_coordinates RPC), 현대백화점/신세계 아카데미
-- 지점은 open_spaces에 전혀 등록돼 있지 않았다(2026-10-03 이마트에만
-- '대형마트문화센터' 카테고리로 등록, 2026-10-04 롯데마트도 동일). 현대
-- 백화점/신세계는 "대형마트"가 아니라 "백화점"이라 같은 category_min을
-- 재사용하지 않고(의미상 오분류), 2026-10-03-emart-store-category-
-- registration.sql과 동일한 패턴으로 새 category_min을 하나 더 둔다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '백화점문화센터', '컬처클럽', false)
on conflict do nothing;

insert into public.service_categories (parent_category, category_name) values
  ('문화시설', '백화점문화센터')
on conflict do nothing;

-- [위치 기준 정렬 RPC — 백화점 지점도 포함](2026-10-07에 만든 함수를 확장)
-- 기존 '대형마트문화센터' 단일 조건을 두 카테고리 모두로 넓힌다.
create or replace function public.get_culture_club_store_coordinates()
returns table(external_id text, lng double precision, lat double precision)
language sql
stable
as $$
  select external_id, st_x(location) as lng, st_y(location) as lat
  from public.open_spaces
  where category_min in ('대형마트문화센터', '백화점문화센터')
    and location is not null;
$$;
