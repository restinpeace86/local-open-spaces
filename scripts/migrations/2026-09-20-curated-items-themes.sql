-- [상시 추천 픽 테마별 분류](2026-09-20 사용자 지시): "언제가도 좋은 상시 테마별
-- 추천픽으로 해주고 5개로 나눠 분류하고.. 클릭하면 거기에 맞는 제휴 상품들 나오는
-- 구조로 해줘" — 하나의 제휴상품이 여러 테마에 걸칠 수 있어(예: "동탄 공룡월드&
-- 키즈카페") text[]로 다대다 태깅한다. spot_curations.curation_badges/
-- events.operating_weekdays와 동일한 기존 패턴(제5장 제4조 기존 구조 우선) — GIN
-- 인덱스는 필터링이 앱 레이어에서 일어나는 기존 관례를 그대로 따라 추가하지 않는다.
alter table public.curated_items
  add column if not exists themes text[] not null default '{}';

comment on column public.curated_items.themes is
  '상시 추천 픽 테마 태그(다중 선택 가능). 예: KIDS_CAFE, THEME_PARK, ANIMAL_AQUARIUM, NATURE_EXPERIENCE, SPECIAL_EXPERIENCE. 빈 배열이면 화면에서 SPECIAL_EXPERIENCE(기타)로 취급.';
