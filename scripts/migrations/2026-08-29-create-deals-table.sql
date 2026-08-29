-- [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시)
--
-- 쿠팡 파트너스/네이버 쇼핑 등 제휴 마케팅 API 상품을 모아 "이벤트픽" 화면의 특가·핫딜
-- 탭에서 보여주기 위한 테이블. 이 앱에는 아직 로그인/세션 인증이 없다(known gap,
-- reservations/category_rules와 동일한 상황) — 노출용 콘텐츠라도 "쓰기"(등록/수정/삭제)가
-- 익명 키로 가능해지면 누구나 가짜 특가나 악성 제휴 링크를 심을 수 있으므로, reservations와
-- 동일하게 RLS를 켜고 정책을 하나도 추가하지 않는다 — anon/authenticated는 완전히 차단되고
-- service_role(createAdminClient())만 접근 가능하다. 공개 조회는 /api/deals(서비스 롤
-- 클라이언트를 쓰는 서버 API)를 통해서만 이뤄진다.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  original_price integer not null check (original_price >= 0),
  discount_price integer not null check (discount_price >= 0 and discount_price <= original_price),
  discount_rate integer not null check (discount_rate >= 0 and discount_rate <= 100),
  image_url text,
  -- 수집 어댑터가 같은 상품을 재수집했을 때 upsert 충돌 대상으로 쓴다(제휴 트래킹 링크가
  -- 상품별로 고유하다는 전제 — 실제 제휴 API 연동 시 원본 상품 ID 기반 값으로 대체 가능).
  affiliate_url text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_deals_is_active_created_at on public.deals (is_active, created_at desc);

alter table public.deals enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — RLS가 켜진 상태에서 정책이 하나도 없으면
-- anon/authenticated 롤은 전부 차단되고 service_role만 통과한다(reservations와 동일 패턴).
