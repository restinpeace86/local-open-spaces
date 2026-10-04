-- [롯데마트 문화센터 변화 감지 — 경량 ping](2026-10-04 사용자 지시): "전체
-- 찌르는건 시간 많이 걸리고 성능 많이 걸리는데... 1페이지라던가 ... 변화가
-- 있는지에 대하여 주기적으로 찔러서 변화감지하는거 ... ping 같은 기능" —
-- 지점당 1페이지만 조회해 얻는 접수가능/온라인마감/접수마감 3개 버킷 건수를
-- 지점별로 저장해두고, 다음 ping 때 숫자가 달라졌으면 "그 지점에 뭔가
-- 바뀌었다"로 간주해 그 지점만 전체 재수집한다(60개 지점 전체 매번 재수집
-- 안 해도 됨).
--
-- [범위 축소 — 사용자 확정](2026-10-04): "학기 2가지 하지마 지금 가을이니깐
-- 가을학기만해" + "수강대상은 일단 안넣어도 되는데?" — ping은 가을학기
-- (202603) 고정, 대상(target) 필터 없이(성인 포함 전체 혼합 응답) 요청해
-- 지점당 1번만 조회한다. 조합 수가 360(지점×대상×학기)에서 60(지점만)으로
-- 줄어 자주 돌려도 부담이 작다.
create table if not exists public.lottemart_culture_club_store_ping_state (
  store_code text primary key,
  accept_total_cnt integer not null default 0,
  onln_close_total_cnt integer not null default 0,
  accept_close_total_cnt integer not null default 0,
  checked_at timestamptz not null default now(),
  changed_at timestamptz
);

comment on table public.lottemart_culture_club_store_ping_state is
  '롯데마트 문화센터 지점별 ping 상태 — 매 ping마다 접수가능/온라인마감/
   접수마감 3개 버킷 건수를 비교해 변화 감지. 성인 대상도 섞여 있어(target
   필터 없이 요청) 성인 강좌 변동만으로도 오탐(false positive) 재수집이
   가끔 일어날 수 있음 — 재수집 비용이 작아(지점 1곳) 허용 가능한 트레이드오프.';

alter table public.lottemart_culture_club_store_ping_state enable row level security;

create policy "lottemart_culture_club_store_ping_state_service_role_all" on public.lottemart_culture_club_store_ping_state
  for all
  to service_role
  using (true)
  with check (true);
