-- [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1·2.6: 글쓰기 폼을
-- "설문형 스마트 리뷰"(3단계 위저드)로 개편하기 위한 mom_pick_posts 확장.
--
-- 기존 마이크로 리뷰/체크리스트 데이터와 그 컬럼(rating/content/checklist_answers)은
-- 삭제하지 않는다(제5장 제4조 기존 구조 우선, 제5장 제11조 서비스 무중단) — 이미
-- 실제로 작성된 과거 글이 있을 수 있고, DB 트리거(promote_to_sprout_on_first_post)와
-- 피드 렌더링(DashboardPostCard)이 이미 그 값을 전제로 동작 중이다. 새 글쓰기 화면은
-- post_type='survey_review' 한 가지만 만들지만, 과거 두 타입은 조회 경로에 그대로 남는다.

-- 1. post_type CHECK 제약 확장(기존 값 유지 + 'survey_review' 추가).
alter table public.mom_pick_posts
  drop constraint if exists mom_pick_posts_post_type_check;
alter table public.mom_pick_posts
  add constraint mom_pick_posts_post_type_check
  check (post_type in ('micro_review', 'checklist', 'survey_review'));

-- 2. event_id: 1단계 "내 주변 인기 스팟" 피커가 이벤트픽 데이터도 포함하므로, 사용자가
-- 스팟이 아니라 이벤트를 선택했을 때의 참조 대상. user_bookmarks가 이미 쓰는
-- spot_id/event_id 이원 참조 패턴을 그대로 재사용한다(제5장 제4조).
alter table public.mom_pick_posts
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- 스팟과 이벤트가 동시에 채워지는 것은 막되(하나의 글은 하나의 장소만 가리켜야
-- 함), 과거 체크리스트 글처럼 둘 다 null인 경우는 계속 허용한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mom_pick_posts_spot_xor_event_check'
  ) then
    alter table public.mom_pick_posts
      add constraint mom_pick_posts_spot_xor_event_check
      check (spot_id is null or event_id is null);
  end if;
end $$;

create index if not exists idx_mom_pick_posts_event on public.mom_pick_posts(event_id);

-- 3. survey_review 전용 컬럼(2단계 설문 문항 7종 + 3단계 사진). 전부 nullable —
-- post_type이 다르면 사용하지 않고, survey_review라도 전부 선택 사항(빈 값 허용).
alter table public.mom_pick_posts
  add column if not exists age_groups text[],
  add column if not exists visit_environment text,
  add column if not exists satisfaction_points text[],
  add column if not exists duration_type text,
  add column if not exists weather_tags text[],
  add column if not exists infra_tags text[],
  add column if not exists companion_type text,
  add column if not exists photo_urls text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mom_pick_posts_visit_environment_check') then
    alter table public.mom_pick_posts
      add constraint mom_pick_posts_visit_environment_check
      check (visit_environment is null or visit_environment in ('outdoor', 'indoor', 'mixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mom_pick_posts_duration_type_check') then
    alter table public.mom_pick_posts
      add constraint mom_pick_posts_duration_type_check
      check (duration_type is null or duration_type in ('short', 'half_day', 'full_day'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mom_pick_posts_companion_type_check') then
    alter table public.mom_pick_posts
      add constraint mom_pick_posts_companion_type_check
      check (companion_type is null or companion_type in ('family', 'friends_group'));
  end if;
end $$;
