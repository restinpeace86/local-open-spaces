-- [표준 중분류 신규 2종 추가 + 기존 데이터 재분류](2026-09-06 사용자 지시): "open_spaces쪽에
-- 표준중분류에 대하여 '어린이집', '유치원' 표준중분류 2개 더 추가해서 만들고 어린이
-- 놀이시설(실내) 중분류에 있는 데이터들에 대하여 제목/명칭에 어린이집이 들어가면
-- 중분류를 어린이집으로 바꾸고 유치원 글자가 들어가면 유치원으로 중분류 바꿔줘"
--
-- get_category_min_options()는 category_rules 테이블을 Source of Truth로 삼아 "표준
-- 중분류" 목록을 만든다(2026-08-26-category-rules-engine.sql 참고) — 그래서 새 표준
-- 중분류를 "추가"하는 것은 이 테이블에 키워드 규칙을 등록하는 것과 같다. 이렇게 등록해
-- 두면 부수 효과로 앞으로 새로 수집되는(category_min이 아직 NULL인) 행도 이름에
-- "어린이집"/"유치원"이 있으면 기존 "[규칙 기반 일괄 재분류 실행]" 버튼으로 자동
-- 분류된다.
--
-- 실측 확인(2026-09-06): category_min='어린이놀이시설(실내)' 1,788건 중 이름에
-- "어린이집"이 있는 행 203건, "유치원"이 있는 행 90건, 둘 다 포함된 행은 0건(순서
-- 무관하게 안전) — 재분류 후 1,495건은 '어린이놀이시설(실내)'로 그대로 남는다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '어린이집', '어린이집', false),
  ('open_spaces', '유치원', '유치원', false)
on conflict do nothing;

-- 기존 "[규칙 기반 일괄 재분류 실행]"(applyCategoryRules)은 category_min IS NULL인
-- 행만 대상으로 한다 — 이미 '어린이놀이시설(실내)'로 채워진 기존 행은 그 버튼으로는
-- 안 바뀐다. 사용자가 명시한 범위(그 중분류에 있는 데이터만) 그대로 직접 UPDATE한다.
-- category_min_source='RULE'로 표시해 향후 "이 값이 왜 이렇게 됐는지" 추적 가능하게
-- 한다(RAW/RULE/MANUAL 기존 3단 구분 그대로 재사용).
update public.open_spaces
set category_min = '어린이집',
    category_min_source = 'RULE'
where category_min = '어린이놀이시설(실내)'
  and name like '%어린이집%';

update public.open_spaces
set category_min = '유치원',
    category_min_source = 'RULE'
where category_min = '어린이놀이시설(실내)'
  and name like '%유치원%';
