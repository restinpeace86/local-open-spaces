-- [제휴 상품 성격 이원화(기간한정 특가 vs 상시 티켓)](2026-09-17 사용자 지시,
-- implementation/todo.md [개선사항 1][개선사항 2]): 프리뷰 카드/상세 뷰에 가격·
-- 상세 설명을 보여주려면 컬럼이 필요한데, curated_items에는 지금까지 title/
-- image_url/booking_url만 있고 가격·설명 텍스트를 저장할 곳이 없었다(마이리얼트립
-- 검색 결과에는 priceDisplay/description이 있지만 등록 시 버려지고 있었음).
alter table public.curated_items
  add column if not exists price_display text,
  add column if not exists description text;
