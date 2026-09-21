-- [나드리픽 파트너 PMS — 네이버 예약 스태프 계정 동기화 봇](2026-09-21 사용자 지시,
-- implementation/todo.md [개선사항 2] 재개): 웹훅(naver-booking/email-inbound)이
-- 현실적으로 더 이상 확장할 방법이 없어(네이버 예약 시스템 자체가 제3자 웹훅을
-- 지원하지 않고, 메일 포워딩도 확인된 실사용 경로가 아님), 유일하게 실제로 가능한
-- 경로인 "네이버 예약 파트너센터 스태프 권한 위임 + 주기적 스크래핑"으로 전환한다.
-- 사용자 명시: "기존 reservations 테이블 기준으로 하면 되지.. 중요한건 그 프로세스"
-- — 다만 실측 확인 결과 `public.reservations`는 이미 완전히 다른 스키마(스팟 방문
-- 예약 신청, spot_id/contact/visit_date)로 쓰이고 있어 그대로 재사용하면 이름
-- 충돌이 난다. 대신 이미 이 목적(파트너별 네이버 예약 데이터, source='naver')으로
-- 설계된 `bookings`에 필요한 컬럼만 추가한다 — 새 테이블을 만들지 않아 "네이버 예약
-- 데이터가 두 곳에 흩어지는" 문제 자체가 생기지 않는다(제5장 제4조 기존 구조 우선).
alter table public.partners
  -- 네이버 예약 파트너센터의 업체 식별자(bizes_id). 스태프 권한 위임이 완료된
  -- 파트너만 값이 채워진다 — 지금은 온보딩 폼이 아니라 운영팀이 직접 DB에
  -- 기록한다(온보딩 UI 확장은 이번 범위 밖).
  add column if not exists naver_bizes_id text;

alter table public.bookings
  -- 네이버가 부여한 예약 고유 번호 — 봇이 같은 예약을 반복 스크래핑해도 중복
  -- 적재되지 않도록 하는 멱등키(요구사항 원문 "예약 번호를 기준으로 Upsert").
  -- 나드리픽 직접 등록/웹훅 건에는 값이 없어 nullable + 부분 유니크 인덱스로 둔다.
  add column if not exists naver_reservation_id text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_bookings_naver_reservation_id
  on public.bookings (naver_reservation_id)
  where naver_reservation_id is not null;
