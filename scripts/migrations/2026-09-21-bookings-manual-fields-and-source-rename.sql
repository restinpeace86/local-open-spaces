-- [네이버 예약 호환 수동 예약 등록 폼](2026-09-21 사용자 지시): "파트너가 직접
-- 예약을 생성 ... source를 'manual'로 지정하여 향후 네이버 자동 수집 건
-- (source='naver')과 완벽하게 호환 및 통합 관리". 이 요청이 설명하는 기능은
-- 2026-09-20에 이미 구현된 "수기 예약 등록"(AddBookingFab/createBooking)과
-- 완전히 같은 기능(파트너가 직접 예약 생성, 네이버 건과 통합 관리)이라, 새
-- 폼/테이블을 병렬로 만들지 않고 기존 기능을 확장한다(제5장 제4조 기존 구조
-- 우선 — 같은 개념에 두 개의 다른 이름(nadripik/manual)이 공존하면 오히려
-- 혼란만 커진다).
--
-- 1) source 값 이름 정정: 기존 'nadripik'을 이번 요청이 명시한 'manual'로
--    바꾼다. 아직 실사용 데이터가 거의 없는 초기 단계라(2026-09-20 기능
--    출시 직후) 안전하게 값 자체를 마이그레이션한다.
update public.bookings set source = 'manual' where source = 'nadripik';

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings
  add constraint bookings_source_check check (source in ('naver', 'manual'));

-- 2) 요청이 명시한 "네이버 예약 표준 매핑" 중 기존 bookings에 없던 2개 필드만
--    추가한다(customer_name/customer_phone/booking_date/head_count(→기존
--    headcount)/status는 이미 있음). 둘 다 기존 행에는 값이 없을 수 있어
--    nullable — 특히 total_price는 파트너가 입력을 생략할 수 있는 선택 항목
--    (요구사항에 "결제 금액, 숫자 입력"이라고만 돼 있고 필수라는 명시가 없음).
alter table public.bookings
  add column if not exists product_name text,
  add column if not exists total_price integer;

alter table public.bookings
  drop constraint if exists bookings_total_price_check;
alter table public.bookings
  add constraint bookings_total_price_check check (total_price is null or total_price >= 0);
