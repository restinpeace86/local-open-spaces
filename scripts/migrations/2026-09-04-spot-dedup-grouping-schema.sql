-- [개선사항10] 관리자 '중복 스팟 그룹핑 및 매핑' 탭(2026-09-04 todo.md) — 신규 스키마.
--
-- 요구사항 그대로: "데이터 삭제나 복잡한 마스터 구조 대신, 그룹에 속한 원천 데이터들에
-- 표준 정보를 각각 업데이트하는 방식" — open_spaces 원본 행은 그대로 두고 nullable
-- 컬럼만 추가해 표준화 정보를 각 행에 동일하게 채워 넣는다(마스터-슬레이브 구조 없음).

-- 1. 서비스 노출 중분류 테이블. "필드: id, category_name, parent_category 등" —
-- 지시서가 준 초기 목록(4개 대분류 x 하위 중분류)을 그대로 시드 데이터로 넣는다.
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  parent_category text not null,   -- 대분류 (예: "키즈/놀이시설")
  category_name text not null,     -- 중분류 (예: "키즈카페 / 실내놀이터")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_category, category_name)
);

insert into public.service_categories (parent_category, category_name) values
  ('키즈/놀이시설', '키즈카페 / 실내놀이터'),
  ('키즈/놀이시설', '놀이방 식당 (밥과 놀이가 공존하는 곳)'),
  ('키즈/놀이시설', '물놀이장 / 바닥분수 (시즌성)'),
  ('키즈/놀이시설', '실내 체험·놀이 공간'),
  ('농장/체험', '동물 먹이주기 체험농장'),
  ('농장/체험', '흙/자연 체험장'),
  ('자연/공원', '대형 근린공원 / 잔디광장'),
  ('자연/공원', '생태공원 / 산책로'),
  ('자연/공원', '수목원 / 식물원'),
  ('자연/공원', '캠핑장 / 피크닉장'),
  ('문화시설', '어린이 도서관'),
  ('문화시설', '어린이 과학관 / 박물관'),
  ('문화시설', '미술관 / 전시체험관')
on conflict (parent_category, category_name) do nothing;

-- 2. open_spaces 정제용 컬럼(전부 Nullable — 정제 전 기존 행에 영향 없음).
alter table public.open_spaces
  add column if not exists standard_name text,
  add column if not exists service_category_id uuid references public.service_categories(id),
  add column if not exists blog_url text,
  add column if not exists age_group text,
  add column if not exists feature_tag text,
  add column if not exists group_id uuid;

-- age_group 허용값을 관리자 UI 선택지와 정확히 맞춘다(요구사항 3): 미취학/취학/
-- 성인(비노출용)/기타(비노출용)/선택 안 함(NULL).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'open_spaces_age_group_check'
  ) then
    alter table public.open_spaces
      add constraint open_spaces_age_group_check
      check (age_group is null or age_group in ('미취학', '취학', '성인', '기타'));
  end if;
end $$;

-- service_category_id로 "이미 정제된 행" 여부를 자주 필터링하므로(그룹핑 후보 조회의
-- 핵심 조건) 인덱스를 둔다.
create index if not exists idx_open_spaces_service_category_id
  on public.open_spaces (service_category_id);
create index if not exists idx_open_spaces_group_id
  on public.open_spaces (group_id) where group_id is not null;

-- 3. 그룹핑 처리 이력 테이블. "이 그룹핑 정보와 처리 완료 상태가 DB에 이력으로
-- 적재되어야 함"(요구사항 2-2) — 어떤 스팟들이 하나의 그룹으로 일괄 처리됐는지,
-- 언제, 어떤 표준 정보로 처리됐는지 추적한다.
create table if not exists public.spot_dedup_groups (
  id uuid primary key default gen_random_uuid(), -- open_spaces.group_id가 이 id를 그대로 참조
  member_spot_ids uuid[] not null,
  standard_name text,
  service_category_id uuid references public.service_categories(id),
  blog_url text,
  age_group text,
  feature_tag text,
  processed_at timestamptz not null default now()
);

alter table public.service_categories enable row level security;
alter table public.spot_dedup_groups enable row level security;
-- 이 프로젝트 전역 관례(curated_items/spot_curations/spot_weather_caches 등과 동일,
-- 제5장 제4조): 정책을 추가하지 않는다 — anon/authenticated 완전 차단, service_role만
-- 접근 가능. 관리자 화면은 서버 API 라우트(createAdminClient)를 통해서만 접근한다.
