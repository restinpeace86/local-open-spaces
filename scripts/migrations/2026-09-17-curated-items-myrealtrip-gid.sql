-- [마이리얼트립 중복 등록 방지](2026-09-17 사용자 보고: "[여주] 루덴시아 테마파크
-- 9월 특가 이거 2개 보이는데? 중복입력된거 아니야?") — curated_items에는 마이리얼
-- 트립 gid를 저장할 컬럼이 없어, 같은 상품을 다른 시점에 다시 "제휴 상품으로 등록"
-- 해도 admin이 이미 등록됐다는 걸 알 방법이 없었다(spot_myrealtrip_links는 gid를
-- unique로 저장해 이 문제가 없었던 것과 대조적). gid를 저장해 등록 전 조회로
-- 중복을 미리 알려줄 수 있게 한다. curated_items는 coupang 등 마이리얼트립과 무관한
-- 수동 등록 상품도 다루므로 nullable로 둔다(unique 제약은 걸지 않는다 — 같은 상품을
-- 의도적으로 재등록해야 하는 경우까지 DB 레벨에서 막지 않고, 관리자 화면에서 경고만
-- 준다).
alter table public.curated_items
  add column if not exists myrealtrip_gid text;

create index if not exists idx_curated_items_myrealtrip_gid on public.curated_items (myrealtrip_gid) where myrealtrip_gid is not null;
