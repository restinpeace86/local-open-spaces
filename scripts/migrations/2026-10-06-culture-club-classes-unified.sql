-- [문화센터 통합 테이블](project/decision-log.md Decision 028): 이마트/
-- 롯데마트(+ 추후 AK플라자/신세계/현대백화점, 최소 5개 브랜드 확정)의 강좌
-- 데이터를 brand 컬럼으로 구분하는 단일 테이블로 통합한다. 통합검색/찜/
-- 찜알림/관리자 패널이 브랜드 수만큼 복제되는 걸 막기 위함 — 수집(ingest)
-- 스크립트 자체는 브랜드별로 독립적으로 그대로 둔다(이 테이블은 "쓰기
-- 대상"만 공유한다).
--
-- 이번 마이그레이션은 1단계(무손상 생성 + 데이터 복사)만 수행한다 — 기존
-- emart_culture_club_classes/lottemart_culture_club_classes 테이블과 이를
-- 참조하는 기존 코드(수집/관리자/프론트엔드/찜)는 전혀 건드리지 않는다.
create table if not exists public.culture_club_classes (
  id bigint generated always as identity primary key,
  brand text not null check (brand in ('emart', 'lottemart', 'ak_plaza', 'shinsegae', 'hyundai')),
  source_class_id text not null, -- 원본 사이트의 class_id(브랜드 스코프 — 브랜드가 다르면 같은 값이 우연히 겹쳐도 무방)
  class_title text not null,
  store_code text,
  store_name text,
  main_category_name text,
  sub_category_name text,
  classroom text,
  class_day text[],
  start_time text,
  end_time text,
  class_original_fee integer,
  class_fee integer,
  class_material_fee integer,
  instructor_name text,
  min_age_months integer,
  max_age_months integer,
  schedule_start_date date,
  schedule_end_date date,
  schedule_days_code text[],
  round integer,
  total_sessions integer,
  -- 공통 3단계 ENUM(검색/필터용). 브랜드 고유 상태 원문(raw_status)은 상태
  -- 변화 비교/분기 로직에 필요해 별도로 보관한다(예: 이마트 filter_status
  -- 3버킷, 롯데마트 registration_status 6상태).
  normalized_status text not null check (normalized_status in ('OPEN', 'CLOSED', 'WAITING')),
  raw_status text,
  -- [예약 오픈 알림 일반화] event-reservation-reminder-push-batch.mjs가 이미
  -- emart_culture_club_classes.register_start_at을 구독 신호로 쓴다 — 통합
  -- 테이블에도 같은 의미의 컬럼을 공통으로 둬서 다른 브랜드도 같은 방식으로
  -- 확장할 수 있게 한다(현재는 이마트만 값이 채워짐).
  register_start_at timestamptz,
  is_excluded boolean not null default false,
  -- [브랜드 전용 필드] 검색/필터 조건으로 쓰이지 않는 브랜드별 특이 필드
  -- (이마트의 channel_online/occupied_full_flag, 롯데마트의 like_count/
  -- discount_badge_text 등)는 공통 컬럼으로 승격하지 않고 여기에 보관한다.
  raw_extra jsonb not null default '{}'::jsonb,
  detail_fetched_at timestamptz,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint culture_club_classes_brand_source_id_unique unique (brand, source_class_id),
  constraint culture_club_classes_age_range_check
    check (min_age_months is null or max_age_months is null or max_age_months >= min_age_months)
);

comment on table public.culture_club_classes is
  '문화센터 강좌 통합 테이블(Decision 028) — emart_culture_club_classes/
   lottemart_culture_club_classes의 공통 정규화 스키마를 brand로 구분해 하나로
   합친다. 1단계(데이터 복사)만 적용된 상태이며, 기존 두 테이블을 참조하는
   코드가 전부 이 테이블로 전환되기 전까지는 기존 테이블이 계속 운영 소스다.';

create index if not exists idx_culture_club_classes_brand_status
  on public.culture_club_classes (brand, normalized_status);

create index if not exists idx_culture_club_classes_collected_at
  on public.culture_club_classes (collected_at desc);

create index if not exists idx_culture_club_classes_store_code
  on public.culture_club_classes (store_code);

alter table public.culture_club_classes enable row level security;

create policy "culture_club_classes_service_role_all" on public.culture_club_classes
  for all
  to service_role
  using (true)
  with check (true);
