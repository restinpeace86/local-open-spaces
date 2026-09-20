-- [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시, docs/partner_spec.md
-- 8절 "스팟/상품 마스터 연동"): 온보딩 폼이 받는 대표 이미지/주소/연동 스팟을 저장할
-- 컬럼 3개를 partners에 추가한다. 폼에서는 주소·스팟 연동을 필수로 받지만, 컬럼
-- 자체는 nullable로 둔다(spec.md 8절 "향후 비즈니스 요구사항 변경에 따른 컬럼 추가·
-- 수정을 대비해 옵셔널 필드 원칙을 철저히 준수" — 필수 여부는 애플리케이션(서버
-- 액션) 레이어에서 검증하고, DB 제약으로 강제하지 않는다).
alter table public.partners
  add column if not exists image_url text,
  add column if not exists address text,
  -- 메인 플랫폼(나드리픽/스팟픽)의 스팟 마스터(open_spaces)와의 연동 — 스팟이
  -- 삭제되더라도 파트너 계정 자체는 남아야 하므로 on delete set null.
  add column if not exists spot_id uuid references public.open_spaces(id) on delete set null;
