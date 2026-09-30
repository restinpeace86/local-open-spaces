-- [순수 어린이전시미술관 표준 중분류 생성](2026-09-30 사용자 지시): "표준
-- 중분류를 '어린이전시미술관' 하나 만들고 여기로 다 이관해줘" — 어린이과학관/
-- 어린이박물관과 동일한 패턴(2026-09-29/2026-09-30).
insert into public.category_rules (target_table, category_min, keyword, is_exclude)
values ('open_spaces', '어린이전시미술관', '어린이전시미술관', false)
on conflict do nothing;
