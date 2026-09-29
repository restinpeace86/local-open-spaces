-- [순수 어린이박물관 표준 중분류 신규 생성](2026-09-30 사용자 지시): "표준중분류로
-- '어린이박물관' 하나 생성하고 하기 파일에 있는 '역사박물관' 표준중분류의 데이터들에
-- 대하여 '어린이박물관'으로 이관시켜줘." — 2026-09-29 어린이과학관 분리와 동일한
-- 관례: 새 표준 중분류를 "추가"하는 건 category_rules에 키워드 규칙을 등록하는 것과
-- 같다(get_category_min_options()의 Source of Truth). 실제 56건 이관은 이름 패턴이
-- 아니라 사용자가 LLM으로 직접 선별한 목록이라
-- scripts/migrations/2026-09-30-split-childrens-museum-category-min.mjs에서 ID
-- 기준으로 처리한다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '어린이박물관', '어린이박물관', false)
on conflict do nothing;
