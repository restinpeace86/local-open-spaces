-- [멀티 엔트리포인트 네이버 공지 레이더](2026-09-19 사용자 지시): "네이버 플레이스
-- 스팟 ID를 파싱해서 우리쪽에 저장해" — 온디맨드 공지 조회 시 매번 전체 URL을
-- 저장/파싱하지 않고 이 짧은 ID만으로 https://pcmap.place.naver.com/restaurant/{id}/feed
-- 등을 바로 조회할 수 있게 한다. UNIQUE로 같은 네이버 업체가 두 open_spaces 행에
-- 중복 연결되는 사고를 막는다(단, NULL은 여러 개 허용 — 대부분의 행은 아직 매칭
-- 안 된 상태가 정상).
alter table public.open_spaces
  add column if not exists naver_place_id text unique;

comment on column public.open_spaces.naver_place_id is
  '네이버 플레이스 업체 고유 ID(관리자가 스팟 큐레이션에서 크롤링한 URL로부터 추출). 공지 온디맨드 조회에 사용.';
