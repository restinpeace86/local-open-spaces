-- [찜질방/스파 뱃지 — 네이버 리뷰 투표 근거 저장](2026-09-26 사용자 지시): "결국 최종
-- 저장은 관리자가 하니깐 이게 매핑하고 몇위에 몇건이고 몇위에 해당하는지 작게 보여줘
-- 뱃지 바로 아래에" — 네이버 플레이스 방문자 리뷰의 구조화된 투표 키워드
-- (VisitorReviewStatsResult.analysis.votedKeyword.details[], code/count 필드)에서
-- 우리 뱃지와 매칭되는 것만 골라 순위/득표수를 저장해둔다.
--
-- 이 값은 "스팟 큐레이션" 탭(⚡ 데이터 가져오기)에서 크롤링할 때 계산해 저장하고,
-- "블로그 뱃지 큐레이션" 화면(뱃지 체크박스가 있는 곳)이 읽어서 뱃지 아래에 순위/
-- 득표수를 보여준다 — 두 화면이 2026-09-08에 의도적으로 분리돼 있어(스팟 정보 등록
-- vs 뱃지 큐레이션), 값을 넘겨줄 저장소가 필요했다.
alter table public.spot_curations
  add column if not exists naver_review_vote_hints jsonb;

comment on column public.spot_curations.naver_review_vote_hints is
  '네이버 플레이스 방문자 리뷰 투표 키워드 중 우리 뱃지와 매칭된 것만: [{code, badgeKey, displayName, count, rank}] — 관리자 참고용, 최종 뱃지 체크 여부는 curation_badges가 진실.';
