-- [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자 지시):
-- 각 파트너에게 고유한 인바운드 메일 주소(예: {inbound_token}@inbound.nadri-pick.com)를
-- 부여하기 위한 토큰. "신규 파트너 온보딩 시 자동으로 고유 토큰이 생성" 요구사항을
-- DB Default로 만족한다(요구사항이 명시한 두 방법 중 하나) — 이렇게 하면
-- src/actions/partner/onboarding.ts가 이 컬럼을 upsert 페이로드에 아예 포함하지
-- 않아도 최초 insert 시 자동으로 채워지고, 이후 온보딩 폼을 다시 제출해도(수정)
-- 페이로드에 없는 컬럼은 upsert가 건드리지 않아 토큰이 그대로 유지된다(이미 발급한
-- 메일 포워딩 주소가 갑자기 바뀌는 사고 방지).
--
-- gen_random_uuid()의 하이픈을 제거하고 앞 12자(48비트, 소문자 hex)만 쓴다 —
-- "영문 소문자/난수 조합" 요구사항을 만족하면서, 이메일 주소 로컬파트로 쓰기에
-- UUID 전체(36자)보다 짧고 다루기 쉽다. pgcrypto는 이미 다른 테이블(bookings.id
-- 등)이 gen_random_uuid()를 쓰고 있어 별도 확장 활성화가 필요 없다.
alter table public.partners
  add column if not exists inbound_token text unique not null
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

comment on column public.partners.inbound_token is
  '클라우드플레어 인바운드 메일 라우팅용 고유 토큰. {inbound_token}@인바운드도메인 형태의 메일 주소로 예약 알림 메일을 수신해 이 값으로 파트너를 역조회한다.';
