-- [이마트 컬처클럽 강좌 리스트 수집](2026-10-03 사용자 지시): "이마트 문화센터 등
-- 다른곳에 대하여 홈플러스처럼 진행할예정이야" — 홈플러스 강좌 리스트
-- (homeplus_lecture_list, 2026-10-02)와 동일한 "관리자 검토용 독립 테이블" 패턴.
-- 홈플러스와 달리 로그인 세션이 필요 없고(공개 AWS AppSync GraphQL API를 직접
-- 호출), reCAPTCHA/NetFunnel은 페이지 로드 보호용이지 이 API 자체를 막지 않는다는
-- 걸 실측으로 확인했다 — Python/Playwright가 아니라 Node.js 스크립트로 간단히
-- 수집 가능하다(scripts/ingest/emart-culture-club.mjs).
create table if not exists public.emart_culture_club_classes (
  id bigint generated always as identity primary key,
  class_id text not null unique,
  class_title text not null,
  class_day text[],
  start_time text,
  end_time text,
  main_category_code text,
  main_category_name text,
  sub_category_code text,
  sub_category_name text,
  store_code text,
  store_name text,
  store_center text,
  classroom text,
  min_class_capacity integer,
  class_capacity integer,
  semester_year text,
  semester text,
  class_original_fee integer,
  class_fee integer,
  class_material_fee integer,
  class_type text,
  occupied_full_flag boolean,
  channel_online boolean,
  channel_offline boolean,
  register_start_date text,
  register_end_date text,
  class_start_date text,
  class_end_date text,
  class_closed_date text,
  -- [상태 필드 없음 — 실측 확인] GraphQL 응답에 등록상태를 직접 나타내는 필드가
  -- 없다(classStatusBO는 "학기전환" 고정값으로 무관, occupiedFullFlag는 정원마감
  -- 여부만 구분). 그래서 어떤 classStatus 필터로 수집됐는지를 그대로 저장한다
  -- (접수대기/접수중/정원마감 중 하나 — 접수마감은 사용자 지시로 수집 제외).
  filter_status text not null check (filter_status in ('접수대기', '접수중', '정원마감')),
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.emart_culture_club_classes is
  '이마트 컬처클럽 강좌 리스트(공개 AppSync GraphQL API, 로그인 불필요). 관리자
   검토용 — homeplus_lecture_list와 동일하게 아직 공개 기능으로 노출되지 않는다.';

create index if not exists idx_emart_culture_club_classes_collected_at
  on public.emart_culture_club_classes (collected_at desc);

alter table public.emart_culture_club_classes enable row level security;

create policy "emart_culture_club_classes_service_role_all" on public.emart_culture_club_classes
  for all
  to service_role
  using (true)
  with check (true);
