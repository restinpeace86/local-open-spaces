-- [어린이놀이시설(실내) 중 instlPlaceCdNm='유치원' 2건 재분류](2026-09-06 사용자 지시):
-- "어 유치원 2건도 유치원 중분류로 보내줘" — 바로 앞 작업
-- ([[2026-09-06-indoor-playground-reclassify-by-instl-place]])에서 이번 요청이 없어
-- 남겨뒀던 나머지 2건.
update public.open_spaces
set category_min = '유치원',
    category_min_source = 'MANUAL'
where category_min = '어린이놀이시설(실내)'
  and raw_data->>'instlPlaceCdNm' = '유치원';
