-- [어린이놀이시설(실내) 중 raw_data.instlPlaceCdNm='종교시설' 재분류](2026-09-07
-- 사용자 지시): "중분류 어린이놀이시설(실내)보면 종교시설도 있고 그랬는데
-- 종교시설에 대한 중분류는 없지 않나?" — 확인 결과 실제로 category_min='종교시설'
-- 값이 open_spaces에 하나도 없었다(사용자 관찰이 정확함). [2026-09-06-indoor-
-- playground-reclassify-by-instl-place.sql]/[2026-09-07-reclassify-outdoor-
-- playground-by-instl-place.sql]과 동일한 관례(instlPlaceCdNm 기준 신규 표준
-- 중분류 추가 + 재분류)를 그대로 적용한다.
--
-- 실측 확인(2026-09-07): category_min='어린이놀이시설(실내)' 대상
-- instlPlaceCdNm='종교시설'인 행 99건.
insert into public.category_rules (target_table, category_min, keyword, is_exclude) values
  ('open_spaces', '종교시설', '종교시설', false)
on conflict do nothing;

update public.open_spaces
set category_min = '종교시설',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(실내)'
  and raw_data->>'instlPlaceCdNm' = '종교시설';
