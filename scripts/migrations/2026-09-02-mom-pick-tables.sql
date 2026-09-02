-- [Decision 019](2026-09-02): 맘스픽(Mom's Pick) 등급/게이미피케이션 & 커뮤니티 체계 도입.
-- spec/community/mom-pick-grades.md 2절(데이터 모델)을 그대로 구현한다.
--
-- profiles(2026-09-02 도입)와 마찬가지로 전부 auth.uid() 기반 RLS를 적용한다 — 이 두
-- 테이블군은 이 프로젝트에서 "로그인한 본인만" 정책이 실제로 붙은 두 번째 그룹이다.

-- ============================================================================
-- 0. profiles 확장: 등급 컬럼
-- ============================================================================
-- 등급은 실시간 집계가 아니라 매일 배치(scripts/ingest/mom-pick-grade-batch.mjs)로
-- 계산해 캐싱한다(Spec 2.4). 'signed_up'은 "로그인은 했지만 아직 새싹맘 조건(첫 후기/
-- 체크리스트)을 채우지 못한" 상태로, 기능 게이팅상 비로그인(Visitor)과 동일하게 취급한다.
alter table public.profiles
  add column if not exists grade text not null default 'signed_up'
    check (grade in ('signed_up', 'sprout', 'active', 'excellent', 'power')),
  add column if not exists grade_updated_at timestamptz,
  -- [챗봇 1회 제한] 비로그인 사용자는 클라이언트(localStorage)로만 소프트 제한하지만,
  -- 로그인했으나 아직 signed_up 단계인 사용자는 실제 계정이 있어 서버에서 확정적으로
  -- 카운트할 수 있다 — 새로고침/기기 변경으로 우회되지 않도록 서버 카운터를 둔다.
  add column if not exists ai_chat_free_uses_used int not null default 0;

-- ============================================================================
-- 1. mom_pick_posts: 후기/체크리스트 ("글쓰기 활동"의 실체)
-- ============================================================================
create table if not exists public.mom_pick_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid references public.open_spaces(id) on delete set null,
  post_type text not null check (post_type in ('micro_review', 'checklist')),
  -- 마이크로 리뷰 전용(post_type = 'micro_review'): 별점 + 선택적 한줄 텍스트.
  rating smallint check (rating between 1 and 5),
  content text,
  -- 체크리스트 전용(post_type = 'checklist'): 공통 5항목 boolean 응답.
  -- { parking, nursing_room, kids_chair, kids_menu, diaper_table }
  checklist_answers jsonb,
  like_count int not null default 0,
  -- [채택] 좋아요 수와 무관하게 관리자가 어드민 화면에서 수동으로 지정하는 별도 개념
  -- (Decision 019). 일반 사용자 정책에서는 갱신할 수 없고 서비스 역할(어드민 API)에서만
  -- 갱신한다 — 아래 트리거로 강제한다.
  is_adopted boolean not null default false,
  adopted_at timestamptz,
  adopted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mom_pick_posts_author on public.mom_pick_posts(author_id, created_at desc);
create index if not exists idx_mom_pick_posts_spot on public.mom_pick_posts(spot_id);
create index if not exists idx_mom_pick_posts_created on public.mom_pick_posts(created_at desc);

alter table public.mom_pick_posts enable row level security;

-- 커뮤니티 피드는 로그인 사용자에게만 공개(비로그인은 anon 키라 auth.uid()가 null).
create policy "mom_pick_posts_select_authenticated" on public.mom_pick_posts
  for select using (auth.uid() is not null);

create policy "mom_pick_posts_insert_own" on public.mom_pick_posts
  for insert with check (auth.uid() = author_id);

create policy "mom_pick_posts_update_own" on public.mom_pick_posts
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy "mom_pick_posts_delete_own" on public.mom_pick_posts
  for delete using (auth.uid() = author_id);

-- [채택 필드 보호] 작성자 본인이라도 is_adopted/adopted_at/adopted_by는 일반 세션에서
-- 절대 바꿀 수 없도록 강제한다. service_role(어드민 API가 사용하는 키)로 들어온 요청만
-- 실제로 반영되고, 그 외에는 조용히 기존 값으로 되돌린다.
create or replace function public.protect_mom_pick_post_adoption_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.is_adopted := old.is_adopted;
    new.adopted_at := old.adopted_at;
    new.adopted_by := old.adopted_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_adoption_fields on public.mom_pick_posts;
create trigger protect_adoption_fields
  before update on public.mom_pick_posts
  for each row execute function public.protect_mom_pick_post_adoption_fields();

-- ============================================================================
-- 2. mom_pick_likes: 좋아요 (우수맘/파워맘 산정과 무관, 열심맘 이상 UI 노출용)
-- ============================================================================
create table if not exists public.mom_pick_likes (
  post_id uuid not null references public.mom_pick_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.mom_pick_likes enable row level security;

-- 본인이 누른 좋아요 여부만 확인 가능(집계는 mom_pick_posts.like_count 비정규화 컬럼 사용).
create policy "mom_pick_likes_select_own" on public.mom_pick_likes
  for select using (auth.uid() = user_id);

create policy "mom_pick_likes_insert_own" on public.mom_pick_likes
  for insert with check (auth.uid() = user_id);

create policy "mom_pick_likes_delete_own" on public.mom_pick_likes
  for delete using (auth.uid() = user_id);

create or replace function public.sync_mom_pick_post_like_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.mom_pick_posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.mom_pick_posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_like_count_ins on public.mom_pick_likes;
create trigger sync_like_count_ins
  after insert on public.mom_pick_likes
  for each row execute function public.sync_mom_pick_post_like_count();

drop trigger if exists sync_like_count_del on public.mom_pick_likes;
create trigger sync_like_count_del
  after delete on public.mom_pick_likes
  for each row execute function public.sync_mom_pick_post_like_count();

-- ============================================================================
-- 3. user_bookmarks: 찜 (열심맘 이상, Decision 003의 ENABLE_USER_BOOKMARK 플래그 대상)
-- ============================================================================
create table if not exists public.user_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spot_id uuid references public.open_spaces(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_bookmarks_exactly_one_target check (
    (spot_id is not null and event_id is null) or (spot_id is null and event_id is not null)
  )
);

create unique index if not exists uniq_user_bookmarks_spot on public.user_bookmarks(user_id, spot_id) where spot_id is not null;
create unique index if not exists uniq_user_bookmarks_event on public.user_bookmarks(user_id, event_id) where event_id is not null;
create index if not exists idx_user_bookmarks_user on public.user_bookmarks(user_id, created_at desc);

alter table public.user_bookmarks enable row level security;

create policy "user_bookmarks_select_own" on public.user_bookmarks
  for select using (auth.uid() = user_id);

create policy "user_bookmarks_insert_own" on public.user_bookmarks
  for insert with check (auth.uid() = user_id);

create policy "user_bookmarks_delete_own" on public.user_bookmarks
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- 4. push_subscriptions: 우수맘 이상 Web Push 구독 정보
-- ============================================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
