-- [이랜드리테일 문화센터 8번째 브랜드 추가](2026-10-09 사용자 캡처 기반):
-- 지점 6개(야탑/평촌아울렛/강남패션/순천/부천/송파), LecTypeID 8개(B/C/D/
-- F/J/K/L/M)를 수집 대상으로 확정(사용자 지시: "K 중도수강도 포함해...
-- J도 뭐 일단은 포함시켜"). Decision 028(5개) → 2026-10-09 AK플라자/
-- 스타필드(6개) → 롯데백화점(7개) → 이번이 8번째.
alter table public.culture_club_classes drop constraint culture_club_classes_brand_check;
alter table public.culture_club_classes add constraint culture_club_classes_brand_check
  check (brand in ('emart', 'lottemart', 'ak_plaza', 'shinsegae', 'hyundai', 'starfield', 'lotte_department', 'eland_retail'));

-- [아울렛문화센터 — 신규 카테고리](실측 확인) 이랜드리테일 매장(야탑/
-- 평촌아울렛/강남패션/순천/부천/송파)은 전통적인 "백화점"도 "대형마트"도
-- "쇼핑몰"도 아닌 아울렛/패션몰 업태라(스타필드의 '쇼핑몰문화센터' 신설
-- 때와 동일한 이유) 기존 category_min을 재사용하지 않고 새로 둔다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '아울렛문화센터', '컬처클럽', false)
on conflict do nothing;

insert into public.service_categories (parent_category, category_name) values
  ('문화시설', '아울렛문화센터')
on conflict do nothing;

-- [위치 기준 정렬 RPC — 아울렛 지점도 포함](기존 함수를 확장)
create or replace function public.get_culture_club_store_coordinates()
returns table(external_id text, lng double precision, lat double precision)
language sql
stable
as $$
  select external_id, st_x(location) as lng, st_y(location) as lat
  from public.open_spaces
  where category_min in ('대형마트문화센터', '백화점문화센터', '쇼핑몰문화센터', '아울렛문화센터')
    and location is not null;
$$;
