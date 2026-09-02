-- [Decision 018](2026-09-02): 일반 사용자 소셜 로그인(Kakao/Google) 및 프로필 연동 도입.
-- spec/common/auth-user-profile.md: "로그인 시 auth.users와 연동된 public.profiles 테이블
-- 생성, birth_years(자녀 출생년도 배열) 필드 포함. 인증된 사용자 본인의 프로필... CRUD
-- 가능하도록 RLS 정책 적용."
--
-- 이 프로젝트 전체에서 유일하게 "로그인한 본인만 접근 가능"이 필요한 테이블이라, 지금까지
-- 써온 "RLS 켜고 정책 없음(service_role 전용)" 패턴(deals/curated_items/spot_curations 등,
-- 로그인 자체가 없던 시절의 관례)과 다르게 auth.uid() 기반 소유자 정책을 실제로 추가한다.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- 자녀 출생년도 배열(예: 2020년생, 2022년생 자녀가 있으면 {2020, 2022}). 자녀가 없거나
  -- 아직 입력하지 않았으면 빈 배열 — null 대신 빈 배열을 기본값으로 둬 "입력 안 함"과
  -- "값이 없어 에러"를 구분할 필요가 없게 한다.
  birth_years integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 행만 CRUD 가능(Spec 원문 그대로) — auth.uid()는 RLS 평가 시점의 요청자 세션에서
-- Supabase가 자동으로 채워주는 함수라 별도 파라미터가 필요 없다.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- [신규 가입 시 프로필 행 자동 생성] Supabase Auth 공식 관례 — 클라이언트가 "로그인 후
-- 프로필 upsert"를 직접 하도록 맡기면 최초 로그인 시 경쟁 상태/실패로 프로필 행이 아예
-- 없는 사용자가 생길 수 있다. auth.users에 신규 행이 생기는 즉시(회원가입/최초 소셜
-- 로그인) DB 트리거로 profiles 행을 확정적으로 만들어 이 위험을 없앤다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
