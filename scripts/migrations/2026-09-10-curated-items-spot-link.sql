-- [관리자 제휴 상품 ↔ 스팟(Spot) 연동](2026-09-10 사용자 지시,
-- implementation/todo.md 개선사항6): "관리자 제휴 상품 등록 폼에 '장소(Spot)' 입력
-- 필드 추가... 선택된 장소의 고유 ID(spot_id)가 제휴 상품 데이터와 1:1로 안전하게
-- 매핑되어 저장되어야 합니다." + "spot_id가 매핑되어 있고 '노출 활성화'된 제휴
-- 상품이 존재하는 스팟인 경우, 일반 마커와 차별화된 특별 마커로 강조".
--
-- 1:1 매핑이지만 UNIQUE 제약은 걸지 않는다 — 한 스팟에 시즌별로 여러 제휴 상품이
-- 붙었다 떨어지는 운영을 막지 않기 위함(노출 여부는 is_active로 제어). 스팟이
-- 삭제되면 링크만 끊는다(제휴 상품 자체는 남긴다).
alter table public.curated_items
  add column if not exists spot_id uuid references public.open_spaces(id) on delete set null;

create index if not exists curated_items_spot_id_idx
  on public.curated_items (spot_id)
  where spot_id is not null;

comment on column public.curated_items.spot_id is
  '연동된 스팟(open_spaces.id). 스팟픽 지도에서 이 스팟을 특가/Hot 마커로 강조하는 데 쓴다. todo.md 개선사항6.';
