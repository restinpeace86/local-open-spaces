-- [스팟 큐레이션 온디맨드 재크롤링](2026-09-20 사용자 지시): "영업시간/메뉴 정보가
-- 1주일이 지나면 유저가 스팟/이벤트 상세를 눌렀을 때 다시 수집" — 마지막으로
-- 크롤링 데이터를 반영한 시각을 기록해 최소 텀(7일)을 판단하는 데 쓴다.
-- spot_notices의 open_spaces.notice_checked_at과 동일한 목적, 다른 테이블/주기.
alter table public.spot_curations
  add column if not exists last_crawled_at timestamptz;
