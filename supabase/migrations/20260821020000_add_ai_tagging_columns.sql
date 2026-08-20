-- project/database_schema.md 3.1/3.2, spec/data/ai-rule.md 5절 구현
-- AI 정제 파이프라인이 추출하는 Parental Checkpoint 태깅 컬럼을 open_spaces/events에 추가한다.

alter table public.open_spaces
  add column if not exists is_kids_friendly boolean not null default false,
  add column if not exists has_parking boolean not null default false,
  add column if not exists stroller_accessible boolean not null default false,
  add column if not exists facility_type varchar(20) not null default '복합',
  add column if not exists target_age_group varchar(50);

alter table public.events
  add column if not exists is_kids_friendly boolean not null default false,
  add column if not exists has_parking boolean not null default false,
  add column if not exists stroller_accessible boolean not null default false,
  add column if not exists facility_type varchar(20) not null default '복합',
  add column if not exists target_age_group varchar(50),
  add column if not exists booking_status varchar(50);
