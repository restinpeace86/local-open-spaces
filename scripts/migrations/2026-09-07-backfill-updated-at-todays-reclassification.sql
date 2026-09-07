-- [수정/적재일 백필](2026-09-07 사용자 지시): "오늘 중분류 옮긴게 있는데 옮겨도
-- 수정적재일이 전혀 바뀌지 않는거 같네 오늘일자로 바껴야하는거 아니야?" — 코드
-- 자체를 고쳐도(2026-09-07-add-religious-facility-category-min.sql 등 앞으로의
-- 변경부터 적용) 오늘 이미 실행한 재분류는 소급 적용되지 않는다. '학교'/'종교시설'
-- 두 표준 중분류는 오늘(2026-09-07) 이전에는 이 값 자체가 전혀 존재하지 않았던
-- 신규 카테고리라(각각 2026-09-07-reclassify-outdoor-playground-by-instl-place.sql,
-- 2026-09-07-add-religious-facility-category-min.sql로 오늘 처음 생성) 이 조건
-- 하나만으로 오늘 재분류한 행을 정확히 특정할 수 있다.
update public.open_spaces
set updated_at = now()
where category_min in ('학교', '종교시설')
  and category_min_source = 'MANUAL';
