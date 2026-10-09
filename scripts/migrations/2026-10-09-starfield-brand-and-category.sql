-- [스타필드 문화센터(클래스콕) 6번째 브랜드 추가](2026-10-09 사용자 지시):
-- "스타필드쪽도 3개 데이터 넣을까하는데" → "그렇게 진행하자" — Decision 028은
-- 5개 브랜드(이마트/롯데마트/AK플라자/신세계/현대백화점)까지만 예정했었고
-- culture_club_classes.brand CHECK 제약에 'starfield'가 없다 — 이번에
-- 사용자가 명시적으로 승인한 6번째 브랜드 확장이라 제약을 넓힌다.
alter table public.culture_club_classes drop constraint culture_club_classes_brand_check;
alter table public.culture_club_classes add constraint culture_club_classes_brand_check
  check (brand in ('emart', 'lottemart', 'ak_plaza', 'shinsegae', 'hyundai', 'starfield'));

-- [쇼핑몰문화센터 — 신규 카테고리](실측 확인) 스타필드는 "대형마트"도
-- "백화점"도 아니라 복합쇼핑몰이다(신세계프라퍼티 운영) — 의미상 기존
-- '대형마트문화센터'/'백화점문화센터'를 재사용하지 않고(2026-10-08
-- 백화점문화센터를 새로 만들 때와 동일한 이유) 새 category_min을 둔다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '쇼핑몰문화센터', '컬처클럽', false)
on conflict do nothing;

insert into public.service_categories (parent_category, category_name) values
  ('문화시설', '쇼핑몰문화센터')
on conflict do nothing;

-- [위치 기준 정렬 RPC — 쇼핑몰 지점도 포함](기존 함수를 확장)
create or replace function public.get_culture_club_store_coordinates()
returns table(external_id text, lng double precision, lat double precision)
language sql
stable
as $$
  select external_id, st_x(location) as lng, st_y(location) as lat
  from public.open_spaces
  where category_min in ('대형마트문화센터', '백화점문화센터', '쇼핑몰문화센터')
    and location is not null;
$$;
