-- [스마트서울맵 신규 표준중분류 2종 등록](2026-10-01 사용자 지시): "데이터 수집
-- 파이프라인 만들자.. 서울, 유아숲 체험시설은 신규로 따고" + "편한외출 서울키즈
-- 오케이존.. 표준중분류 키즈친화 식당(오케이존)으로 하나 만들고" — 어린이과학관/
-- 어린이박물관/어린이전시미술관과 동일한 패턴.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '유아숲체험원', '유아숲체험원', false),
  ('open_spaces', '키즈친화 식당(오케이존)', '오케이존', false)
on conflict do nothing;
