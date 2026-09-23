-- [파트너 상품 관리](2026-09-23 사용자 지시): "파트너 예약추가 화면에서 상품명/객실명을..
-- 콤보박스로 선택하게 해.. 상품의 금액 같이 붙으니.. 더보기에서 화면 하나 만들어서
-- 세팅할 수 있게" — 예약 등록 시 자유 텍스트로 상품명을 매번 입력하던 것을, 파트너가
-- 미리 등록해둔 상품 카탈로그(이름+가격)에서 선택하는 방식으로 바꾼다.
--
-- [가격 기준 — 팀당 vs 인당](2026-09-23 사용자 지시): "상품에 대하여 팀당 1개인지
-- 아니면 인당 1개인지의 문제.. 두가지 다 성립하도록" — 상품마다 가격이 인원수와
-- 무관한 고정가(예: 캠핑사이트 1박)인지, 인원수만큼 곱해야 하는 단가(예: 입장권
-- 1인 가격)인지가 다르다. pricing_unit으로 상품별로 선택하게 한다.
create table if not exists public.partner_products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  name text not null,
  price integer not null default 0,
  pricing_unit text not null default 'flat' check (pricing_unit in ('flat', 'per_person')),
  created_at timestamptz not null default now()
);

comment on column public.partner_products.pricing_unit is
  'flat = 팀당(인원수와 무관하게 price 그대로가 총액), per_person = 인당(price * 인원수가 총액)';

create index if not exists idx_partner_products_partner on public.partner_products (partner_id);

alter table public.partner_products enable row level security;

-- [기존 관례 재사용](제5장 제4조): partners/bookings와 동일한 RLS 패턴(auth.uid() = partner_id).
create policy "partner_products_select_own" on public.partner_products
  for select using (auth.uid() = partner_id);

create policy "partner_products_insert_own" on public.partner_products
  for insert with check (auth.uid() = partner_id);

create policy "partner_products_update_own" on public.partner_products
  for update using (auth.uid() = partner_id) with check (auth.uid() = partner_id);

create policy "partner_products_delete_own" on public.partner_products
  for delete using (auth.uid() = partner_id);
