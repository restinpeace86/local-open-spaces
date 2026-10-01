-- [스마트서울맵 신규 노출중분류 2종 등록](2026-10-01 사용자 지시): 표준중분류
-- '유아숲체험원'/'키즈친화 식당(오케이존)' 신설에 맞춰 노출중분류(소비자 화면
-- /nearby 필터)도 동일한 이름으로 등록한다. (parent_category, category_name)
-- unique 제약이 이미 있어(2026-09-04-spot-dedup-grouping-schema.sql) on conflict
-- do nothing으로 안전하게 재실행 가능.
insert into public.service_categories (parent_category, category_name) values
  ('자연/공원', '유아숲체험원'),
  ('키즈/놀이시설', '키즈친화 식당(오케이존)')
on conflict do nothing;
