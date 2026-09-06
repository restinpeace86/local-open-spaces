-- [표준 중분류 "식당" 신규 추가 + 놀이방식당 중 노출중분류 없는 것 이동](2026-09-06
-- 사용자 지시): "중분류 식당 하나 더 만들어줘 그리고 놀이방식당중에 노출중분류가
-- 없는 것에 대하여 전부 식당으로 옮겨줘"
--
-- get_category_min_options()는 category_rules 테이블을 Source of Truth로 삼아 "표준
-- 중분류" 목록을 만든다(2026-08-26-category-rules-engine.sql). 새 표준 중분류를
-- "추가"하는 것은 이 테이블에 키워드 규칙을 등록하는 것과 같다 — 이렇게 등록해 두면
-- 앞으로 새로 수집되는(category_min이 아직 NULL인) 행도 이름에 "식당"이 있으면 기존
-- "[규칙 기반 일괄 재분류 실행]" 버튼으로 자동 분류된다(2026-09-06-add-daycare-
-- kindergarten-category-min.sql과 동일한 관례).
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '식당', '식당', false)
on conflict do nothing;

-- 실측 확인(2026-09-06): category_min='놀이방식당' 총 1,828건 중 노출중분류
-- (service_category_id)가 없는 행 1,788건 / 있는 행 40건. 노출중분류가 있는 40건은
-- 스팟 큐레이션 탭에서 이미 "키즈 놀이 가능 식당"으로 검수·확정된 것들이라 그대로
-- '놀이방식당'에 남기고, 아직 검수 전인 나머지 1,788건만 사용자가 지시한 범위 그대로
-- '식당'으로 옮긴다. 이 기준(service_category_id 유무)은 이름 키워드 매칭이 아니라
-- 관리자의 명시적 판단이므로 category_min_source는 'RULE'이 아니라 'MANUAL'로
-- 표시한다(RAW/RULE/MANUAL 기존 3단 구분 재사용).
update public.open_spaces
set category_min = '식당',
    category_min_source = 'MANUAL'
where category_min = '놀이방식당'
  and service_category_id is null;
