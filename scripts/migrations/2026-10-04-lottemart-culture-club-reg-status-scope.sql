-- [수집 범위 축소 — search_reg_status=1만](2026-10-04 사용자 지시): "search_reg_status가
-- 1이 접수가능/접수준비쪽(바로신청, 마감임박 등) ... 2가 온라인마감/현장접수 ...
-- 3이 접수마감, 대기자신청, 전화문의 ... 여기에 대하여 1인 것만 우리가 받아도
-- 문제 없을까? 조금이라도 비용을 줄여볼까해서" — 실측 확인(5개 지점): 2번
-- 버킷은 전부 0건, 1번 버킷 비율은 6.4%~23.6%(평균 10%대) — 1번만 가져오면
-- 페이지네이션 요청량이 85~93% 줄어든다. 대기자신청 전용 강좌는 신규 발견
-- 경로가 사라지는 트레이드오프를 사용자가 수용(이미 찜한 건 찜-상태감시가
-- 별도로 상세페이지를 직접 확인하므로 영향 없음).
--
-- [접수불가 — 새 상태값] 1번 버킷에서 빠진(바로신청/대기자신청이었다가 사라진)
-- 강좌는 정확히 어떤 상태(접수마감/대기자신청/전화문의)로 바뀌었는지 더 이상
-- 알 수 없다 — 추측으로 '접수마감'이라고 잘못 단정하지 않고(제3장 제5조),
-- "온라인으로 더 이상 할 수 있는 게 없다"는 사실만 정직하게 표현하는 별도
-- 값을 둔다.
alter table public.lottemart_culture_club_classes drop constraint if exists lottemart_culture_club_classes_registration_status_check;
alter table public.lottemart_culture_club_classes
  add constraint lottemart_culture_club_classes_registration_status_check check (
    registration_status in ('바로신청', '대기자신청', '접수마감', '전화문의', '현장접수', '접수불가')
  );
