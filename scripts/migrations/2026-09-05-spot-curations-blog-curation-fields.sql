-- [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021): 네이버
-- 블로그 검색 결과를 참고해 관리자가 뱃지/노출 중분류를 빠르게 채울 수 있게 하는
-- 기능의 저장소. 블로그 본문 텍스트는 절대 저장하지 않는다(모달에서 참고용으로만
-- 쓰고 폐기) — URL 3개와 체크한 뱃지 목록만 저장한다. "노출 중분류"는 이미 있는
-- open_spaces.service_category_id를 그대로 쓰므로 여기에 중복 컬럼을 만들지 않는다
-- (제5장 제4조 기존 구조 우선).
alter table public.spot_curations
  add column if not exists blog_url_1 text,
  add column if not exists blog_url_2 text,
  add column if not exists blog_url_3 text,
  add column if not exists curation_badges text[] not null default '{}';
