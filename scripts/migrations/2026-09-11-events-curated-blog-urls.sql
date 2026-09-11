-- [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
-- 개선사항7-2/8): "관리자 화면 Events 탭 상세 팝업에 블로그 큐레이션 버튼 추가...
-- 블로그 후보 3개 중 체크하여 저장한 URL들이 해당 이벤트 데이터의 필드(예:
-- curated_blog_urls)에 저장" → "유저 상세 화면에서 방문 후기/추천 블로그 카드로
-- 조건부 노출".
--
-- open_spaces의 spot_curations(Decision 021)와 달리 events는 별도 큐레이션 테이블이
-- 없고(가격/영업시간/메뉴 등 스팟 전용 큐레이션 개념 자체가 events에는 없음), todo.md가
-- 직접 제안한 대로 events 테이블에 단순 배열 컬럼만 추가한다 — 관리자가 직접 고른
-- URL만 저장하고(2026-09-10-open-spaces-blog-review-cache.sql처럼 자동 재검색
-- TTL 캐시가 아니다), 본문 텍스트는 저장하지 않는다(Decision 021과 동일한 저장/폐기
-- 원칙 — 검색 결과는 관리자 화면에서만 잠깐 보여주고 URL만 확정 저장).
alter table public.events
  add column if not exists curated_blog_urls text[] not null default '{}'::text[];

-- 최대 3개까지만 저장한다(요구사항 "블로그 후보 3개 중 체크").
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_curated_blog_urls_max3'
  ) then
    alter table public.events
      add constraint events_curated_blog_urls_max3
      check (array_length(curated_blog_urls, 1) is null or array_length(curated_blog_urls, 1) <= 3);
  end if;
end $$;

comment on column public.events.curated_blog_urls is
  '관리자가 블로그 큐레이션 모달에서 직접 선택·저장한 방문 후기/안내 블로그 URL(최대 3개). todo.md 개선사항7-2/8.';
