-- [네이버 플레이스 공지 온디맨드 레이더 + 관리자 큐레이션 파이프라인](2026-09-19
-- 사용자 지시): 유저가 스팟/이벤트/제휴상품 상세 중 어디로 들어오든 연동된
-- open_spaces의 네이버 플레이스 공지(피드)를 감지해 관리자 스테이징함에 쌓고,
-- 관리자가 검수/가공해 발행한 것만 최종 노출한다.

-- "오늘 날짜로 체크된 적이 없다면"(요청 원문) — 달력일 기준 온디맨드 TTL.
-- open_spaces.blog_review_updated_at(2026-09-10, 10일 롤링 TTL)과는 의도적으로
-- 다른 규칙이라 별도 컬럼을 둔다.
alter table public.open_spaces
  add column if not exists notice_checked_at timestamptz;

create table if not exists public.spot_notices (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.open_spaces(id) on delete cascade,
  -- 네이버 feed 원문 식별자("{placeId}_{feedId}") — 같은 공지를 매일 재조회해도
  -- 중복 스테이징하지 않기 위한 유니크 키(spot_id와 묶어서 유니크).
  raw_naver_feed_id text not null,
  raw_title text,
  raw_content text,
  raw_image_url text,
  raw_category text,
  -- 네이버 createdString 원문(YYYYMMDD) 그대로 보존 — 날짜 파싱/타임존 변환을
  -- 임의로 하지 않는다(추측 금지, 제3장 제5조).
  raw_posted_at text,
  curated_title text,
  curated_content text,
  curated_image_url text,
  status text not null default 'pending' check (status in ('pending', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (spot_id, raw_naver_feed_id)
);

create index if not exists spot_notices_spot_status_idx on public.spot_notices (spot_id, status);

comment on table public.spot_notices is
  '네이버 플레이스 공지(피드) 원본 스테이징 + 관리자 큐레이션/발행 상태. status=published만 유저 화면에 노출.';
