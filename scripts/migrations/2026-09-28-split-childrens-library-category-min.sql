-- [순수 어린이도서관 표준 중분류 신규 생성 및 이관](2026-09-28 사용자 지시): "표준중
-- 분류에 대하여 현재 '도서관'표준 중분류로 된거 '어린이도서관'으로 중분류 하나 새로
-- 생성하고 여기에 156건만 이관해줄래?"
--
-- 배경: 이전에 확정한 순수 어린이도서관 156건(category_min='도서관', 이름에
-- "어린이/아동" + "자료실" 제외, 2026-09-27-library-candidate-badge-exclude-
-- section-only)은 이미 노출중분류(service_category_id)를 "어린이 도서관"으로
-- 매핑해뒀지만, 표준 중분류(category_min)는 여전히 일반 '도서관'과 같았다.
--
-- 1. 새 표준 중분류를 "추가"하는 건 category_rules에 키워드 규칙을 등록하는 것과
-- 같다(2026-09-06-add-restaurant-category-min.sql과 동일 관례) — get_category_
-- min_options()가 이 테이블을 Source of Truth로 삼아 어드민 드롭다운을 만든다.
-- 다만 이 키워드("어린이도서관")는 이름에 그 문자열이 정확히 포함된 경우만 잡아서
-- (예: "국립어린이청소년도서관"처럼 "어린이"와 "도서관" 사이에 다른 말이 끼면 이
-- 키워드로는 못 잡는다) 향후 신규 수집분 전체를 완벽히 자동 분류하진 못한다 —
-- 지금 156건은 아래 2번에서 이름 패턴(정규식) 기준으로 직접 지정한다(추측 없이
-- 이미 확정된 후보 목록 그대로).
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '어린이도서관', '어린이도서관', false)
on conflict do nothing;

-- 2. 실측 확인: 156건 전부 현재 category_min='도서관'(RAW 21건, RULE 135건)이라
-- 충돌 없음. 이름 키워드 매칭이 아니라 관리자의 명시적 판단(자료실 제외 등)이므로
-- category_min_source는 2026-09-06 마이그레이션과 동일한 관례로 'MANUAL'로 표시한다.
update public.open_spaces
set category_min = '어린이도서관',
    category_min_source = 'MANUAL'
where category_min = '도서관'
  and name ~* '어린이|아동'
  and name !~* '자료실';
