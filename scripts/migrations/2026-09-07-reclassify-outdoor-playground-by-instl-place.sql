-- [어린이놀이시설(야외) 중 raw_data.instlPlaceCdNm 기준 재분류](2026-09-07 사용자 지시):
-- "어린이놀이시설(야외) 중분류에서도 instlPlaceCdNm: 주택단지, 하기는 학교 중분류
-- 새로 추가해서 학교 중분류로 instlPlaceCdNm: 학교, 하기는 어린이집 중분류로
-- instlPlaceCdNm: 어린이집, 하기는 유치원 중분류로 instlPlaceCdNm: 유치원"
--
-- "주택단지"만 목적지가 메시지에 명시되지 않아(실내 케이스와 달리 5,908건으로
-- 전체의 상당 부분을 차지해 임의 판단 대신 확인 질문) 사용자에게 직접 확인 —
-- "기타로 이동" 응답을 받았다([[2026-09-06-indoor-playground-reclassify-by-instl-
-- place]] 완료 시점 이후).
--
-- 실측 확인(2026-09-07): category_min='어린이놀이시설(야외)' 대상 instlPlaceCdNm별
-- 건수 — 주택단지 5,908건 / 어린이집 1,803건 / 유치원 957건 / 학교 642건.
--
-- '학교'는 이 프로젝트에 아직 없는 새 표준 중분류라 category_rules에도 등록한다
-- (get_category_min_options는 2026-08-27 수정 이후 실제 category_min 컬럼에서
-- 직접 distinct를 뽑으므로 이 등록 자체가 필터 노출의 필수 조건은 아니지만,
-- 어린이집/유치원/식당과 동일한 관례로 향후 신규 수집 데이터의 이름 키워드 기반
-- 자동 분류["규칙 기반 일괄 재분류 실행"] 목적으로 등록해 둔다). '기타'/'어린이집'/
-- '유치원'은 이미 존재하는 표준 중분류라 별도 등록이 필요 없다.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '학교', '학교', false)
on conflict do nothing;

-- 이 기준(raw_data JSONB 필드 값)은 이름 키워드 매칭이 아니라 관리자의 명시적 판단이므로
-- category_min_source는 'RULE'이 아니라 'MANUAL'로 표시한다.
update public.open_spaces
set category_min = '기타',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(야외)'
  and raw_data->>'instlPlaceCdNm' = '주택단지';

update public.open_spaces
set category_min = '학교',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(야외)'
  and raw_data->>'instlPlaceCdNm' = '학교';

update public.open_spaces
set category_min = '어린이집',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(야외)'
  and raw_data->>'instlPlaceCdNm' = '어린이집';

update public.open_spaces
set category_min = '유치원',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(야외)'
  and raw_data->>'instlPlaceCdNm' = '유치원';
