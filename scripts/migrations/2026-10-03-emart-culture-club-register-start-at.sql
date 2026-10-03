-- [접수 시작 시각 컬럼 추가](2026-10-03 사용자 지시): "접수기간은 연/월일뿐만
-- 아니라 시간까지 되어있어 1000은 10:00 (kst)를 의미하는걸텐데.. 해당 시간 중요해
-- 예약 시작시간이니 이 부분 파싱해서 따로 컬럼으로 가지고 있든 해야할거같은데?"
-- register_start_date는 원본 "YYYYMMDDHHmm" 텍스트(KST)를 그대로 보존하고,
-- register_start_at(timestamptz)에 파싱된 값을 별도로 둔다 — 추후 "접수 시작 전
-- 알람"(찜) 기능에서 시각 비교/정렬에 쓸 용도.
alter table public.emart_culture_club_classes
  add column if not exists register_start_at timestamptz;

comment on column public.emart_culture_club_classes.register_start_at is
  'register_start_date(원본 "YYYYMMDDHHmm", KST) 파싱 결과. 접수 시작 전 알람
   등 시각 연산용 — 원본 텍스트 컬럼은 그대로 유지한다.';

create index if not exists idx_emart_culture_club_classes_register_start_at
  on public.emart_culture_club_classes (register_start_at);

-- 기존에 이미 수집된 행들(register_start_date는 있지만 register_start_at은
-- 아직 null)을 1회 백필한다. 이후 신규 수집은 emart-culture-club.mjs의
-- parseRegisterStartAt()이 매 upsert마다 채우므로 이 UPDATE는 재실행해도
-- 안전하다(register_start_at is null 조건으로 멱등).
update public.emart_culture_club_classes
set register_start_at = (
  substring(register_start_date, 1, 4) || '-' ||
  substring(register_start_date, 5, 2) || '-' ||
  substring(register_start_date, 7, 2) || 'T' ||
  substring(register_start_date, 9, 2) || ':' ||
  substring(register_start_date, 11, 2) || ':00+09:00'
)::timestamptz
where register_start_at is null
  and register_start_date is not null
  and length(register_start_date) = 12;
