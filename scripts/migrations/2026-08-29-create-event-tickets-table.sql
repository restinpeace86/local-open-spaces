-- [이벤트픽 & 티켓 할인 정보 MVP](2026-08-29 사용자 지시)
--
-- 지역 축제/체험 프로그램/입장권 등 "이벤트 & 티켓 할인 정보"를 담는 테이블. 지시서
-- 원문은 테이블명을 "events"로 지정했으나, 이 프로젝트에는 이미 위치/일정 기반으로
-- 20개 이상의 수집 어댑터가 채우는 별개의 핵심 events 테이블이 있고(홈 화면 "이벤트픽"
-- 탭 전체가 그 테이블로 동작 중), 스키마도 이번 지시서의 컬럼(event_period/location_name/
-- original_price/discount_price/booking_url 등)과 겹치지 않는다 — 사용자 확인 결과 완전히
-- 분리된 새 테이블 event_tickets로 만들기로 했다(기존 events 테이블은 전혀 건드리지 않음).
--
-- 보안: 이 앱은 아직 로그인/세션 인증이 없다(known gap). deals/reservations와 동일하게
-- RLS를 켜고 정책을 하나도 추가하지 않는다 — anon/authenticated는 완전히 차단되고
-- service_role(createAdminClient())만 접근 가능하다.
create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  -- 지시서가 정확한 날짜 구조(시작/종료일)를 요구하지 않고 "행사 기간"을 카드에 직관적으로
  -- 보여주는 문자열로만 언급해, 날짜 연산/필터링이 필요 없는 표시용 자유 텍스트로 둔다
  -- (예: "2026-10-01 ~ 2026-10-10"). 날짜 기반 정렬/필터가 필요해지면 별도 지시로 확장한다.
  event_period text,
  location_name text,
  original_price integer not null check (original_price >= 0),
  discount_price integer not null check (discount_price >= 0 and discount_price <= original_price),
  discount_rate integer not null check (discount_rate >= 0 and discount_rate <= 100),
  image_url text,
  booking_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_tickets_is_active_created_at on public.event_tickets (is_active, created_at desc);

alter table public.event_tickets enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — deals/reservations와 동일 패턴.
