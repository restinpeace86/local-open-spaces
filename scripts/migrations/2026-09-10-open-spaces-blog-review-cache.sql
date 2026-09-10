-- [스팟픽 상세 카드 네이버 블로그 후기 캐싱(TTL)](2026-09-10 사용자 지시,
-- implementation/todo.md 개선사항2-7): "상세 카드 내 네이버 블로그 후기를 노출하되,
-- 매번 페이지를 열 때마다 외부 Search API를 호출하지 않도록 10일 주기 캐싱(TTL)
-- 로직". "스팟별로 최대 3개의 블로그 링크(blog_urls)와 마지막 갱신 일시
-- (blog_updated_at)를 저장할 수 있는 필드가 필요".
--
-- 기존 `open_spaces.blog_url`(단수, text)은 수집 파이프라인/레거시 용도라 그대로
-- 두고, 소비자 상세 카드용 신뢰도 검증 캐시는 별도 컬럼으로 둔다.
--  - blog_review_urls: 신뢰도 검증(주소/지역명이 제목·본문에 포함)을 통과한 URL만
--    최대 3개. 빈 배열이면 "검색했으나 신뢰할 만한 후기 0건" 또는 "아직 미조회".
--  - blog_review_updated_at: 마지막으로 네이버 검색 API를 호출해 이 캐시를 채운
--    시각. NULL이면 한 번도 조회한 적 없음. 조회 결과가 0건이어도 이 값을 갱신해
--    (다음 10일 동안) 매 상세 열람마다 API를 재호출하지 않는다.
alter table public.open_spaces
  add column if not exists blog_review_urls text[] not null default '{}'::text[];

alter table public.open_spaces
  add column if not exists blog_review_updated_at timestamptz;

-- blog_review_urls는 최대 3개까지만 저장한다(스펙).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'open_spaces_blog_review_urls_max3'
  ) then
    alter table public.open_spaces
      add constraint open_spaces_blog_review_urls_max3
      check (array_length(blog_review_urls, 1) is null or array_length(blog_review_urls, 1) <= 3);
  end if;
end $$;

comment on column public.open_spaces.blog_review_urls is
  '스팟픽 상세 카드용: 신뢰도 검증(주소/지역명이 제목·본문 포함) 통과한 네이버 블로그 후기 URL 최대 3개. todo.md 개선사항2-7 캐시.';
comment on column public.open_spaces.blog_review_updated_at is
  '위 blog_review_urls를 네이버 검색 API로 마지막 갱신한 시각(10일 TTL). NULL=미조회.';
