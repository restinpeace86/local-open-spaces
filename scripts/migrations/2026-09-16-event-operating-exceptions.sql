-- [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
-- [개선사항 2]): 기존 operating_weekdays/excluded_weekdays/operating_nth_weekdays
-- (매주·매월 N번째 반복 규칙, event-operating-schedule.ts)만으로는 "올해 설날은
-- 화요일이라 원래 화요일 운영일이지만 이날만은 특별히 쉰다" 같은 단발성 예외를
-- 표현할 수 없다 — 그 예외를 이벤트별로 저장하는 테이블이다.
--
-- 공휴일은 이벤트마다 다시 입력하지 않도록 public_holidays(연도별 참고 목록,
-- 관리자가 연 1회 수동으로 가져오거나 직접 입력)에서 골라 담을 수 있게 하되,
-- 실제로 "이 이벤트가 이 날 쉬는지"는 event_operating_exceptions에 이벤트별로
-- 저장한다 — 모든 이벤트가 공휴일에 자동으로 쉬는 것은 아니기 때문이다(제3장
-- 제5조 추측 금지: 공휴일에 오히려 성수기인 체험/축제 이벤트도 많음).
create table if not exists public.public_holidays (
  holiday_date date primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_operating_exceptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  exception_date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (event_id, exception_date)
);

create index if not exists idx_event_operating_exceptions_event_id on public.event_operating_exceptions (event_id);

alter table public.public_holidays enable row level security;
alter table public.event_operating_exceptions enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — event_price_verifications와 동일 패턴
-- (관리자 API는 service_role(createAdminClient())만 사용, 유저 화면은 계산된
-- 결과만 받는 별도 공개 API를 통해서만 조회한다).
