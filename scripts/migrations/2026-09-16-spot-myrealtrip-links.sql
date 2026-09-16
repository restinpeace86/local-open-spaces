-- [스팟 상세 → 마이리얼트립 자동 매칭](2026-09-16 사용자 지시): "스팟픽에서 우리의
-- 키즈카페 장소 검색시 해당 장소 눌렀을때 내부적으로 마이리얼트립에서 해당 상호명으로
-- 검색하고 있으면.. 동적 버튼을 통하여 티켓 구매 둘러보기.. 관리자가 승인을 한 번
-- 거치기" — 완전 자동(유저 클릭 시점에 검색+등록)은 잘못된 업체와 연결될 위험과
-- 실시간 트래픽에서 검색 API 분당 한도(200건) 초과 위험이 있어, 관리자가 먼저
-- 검색·확인·승인한 매칭만 저장해 두고 유저 화면은 이미 승인된 결과만 읽는다
-- (실시간 API 호출 없이 캐시된 마이링크만 노출 — 제5장 제11조 안정성).
create table if not exists public.spot_myrealtrip_links (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null unique references public.open_spaces(id) on delete cascade,
  gid text not null,
  item_name text not null,
  image_url text,
  price_display text,
  product_url text not null,
  mylink text not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_spot_myrealtrip_links_spot_id on public.spot_myrealtrip_links (spot_id);

alter table public.spot_myrealtrip_links enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — event_price_verifications/
-- event_operating_exceptions와 동일 관례(관리자 API는 service_role만 사용, 유저
-- 화면은 계산된 결과만 반환하는 별도 공개 API를 통해서만 조회).
