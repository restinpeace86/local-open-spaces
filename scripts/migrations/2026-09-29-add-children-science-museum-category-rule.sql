-- [순수 어린이과학관 표준 중분류 신규 생성](2026-09-29 사용자 지시): "표준중분류
-- 관련하여 문화시설 대분류쪽에 '어린이과학관'을 생성해줘." — 2026-09-28 어린이도서관
-- 분리(2026-09-28-split-childrens-library-category-min.sql)와 동일한 관례: 새
-- 표준 중분류를 "추가"하는 건 category_rules에 키워드 규칙을 등록하는 것과 같다
-- (get_category_min_options()가 이 테이블을 Source of Truth로 삼아 어드민 드롭다운을
-- 만든다). 실제 69건 이관은 이름 패턴이 아니라 사용자가 직접 선별한 목록이라
-- scripts/migrations/2026-09-29-split-childrens-science-museum-category-min.mjs에서
-- ID 기준으로 처리한다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '어린이과학관', '어린이과학관', false)
on conflict do nothing;
