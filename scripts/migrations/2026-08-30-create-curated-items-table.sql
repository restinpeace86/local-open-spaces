-- [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
-- 사용자 지시)
--
-- 기존 event_tickets 테이블(축제/체험/티켓 전용 — description/location_name/가격 필드 등
-- 도메인 특화 컬럼 다수)에서 벗어나, 쿠팡 등 임의의 제휴 상품까지 한 테이블로 관리할 수
-- 있는 범용 큐레이션 테이블을 새로 만든다. event_tickets는 그대로 남겨두고(다른 소비처가
-- 생길 수 있어 임의로 스키마/데이터를 삭제하지 않음) 프런트엔드 연결만 이 테이블로
-- 옮긴다.
--
-- 보안: 이 앱은 아직 로그인/세션 인증이 없다(known gap). deals/event_tickets와 동일하게
-- RLS를 켜고 정책을 하나도 추가하지 않는다 — anon/authenticated는 완전히 차단되고
-- service_role(createAdminClient())만 접근 가능하다. 공개 조회(홈 화면)와 어드민
-- 조회/등록/수정 모두 서버 API 라우트를 통해서만 이뤄진다.
create table if not exists public.curated_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  booking_url text not null,
  category text not null default 'ticket',
  is_active boolean not null default true,
  operation_start_date date,
  operation_end_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_curated_items_is_active_created_at on public.curated_items (is_active, created_at desc);
create index if not exists idx_curated_items_operation_dates on public.curated_items (operation_start_date, operation_end_date);

alter table public.curated_items enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — deals/event_tickets와 동일 패턴.
