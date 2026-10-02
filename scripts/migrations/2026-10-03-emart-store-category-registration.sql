-- [대형마트 문화센터 신규 표준중분류/노출중분류 등록](2026-10-03 사용자 지시):
-- "현재 이마트 무슨지점 다 나와있는데.. 해당 이마트점에 대하여 open_spaces에
-- 문화시설 대분류에 '대형마트문화센터'로 해당 스팟들 넣어줘" — 유아숲체험원/
-- 키즈친화 식당(오케이존)(2026-10-01)과 동일한 패턴.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '대형마트문화센터', '컬처클럽', false)
on conflict do nothing;

insert into public.service_categories (parent_category, category_name) values
  ('문화시설', '대형마트문화센터')
on conflict do nothing;
