-- [찜 — 롯데마트 문화센터 클래스까지 확장](2026-10-04 사용자 지시): "우리껀 찜 목록
-- 필요해 장바구니는 필요없고 어차피 찜한게 장바구니 역할하니깐" — 이마트 컬처클럽
-- 확장(2026-10-03)과 동일한 패턴으로 user_bookmarks를 네 번째 nullable FK로
-- 넓힌다. lottemart_culture_club_classes는 그대로 독립 테이블로 둔다(이마트와
-- 스키마를 맞추지 않기로 한 2026-10-04 결정 그대로 — 찜 메커니즘만 공유).
--
-- [이마트와의 차이 — 예약 알람 비대상] 이마트는 register_start_at(접수 시작 시각)이
-- 있어 찜이 "예약 오픈 알람 자동 구독"의 의미를 가지지만, 롯데마트는 실측 확인
-- (2026-10-04) 결과 접수 시작을 기다리는 "접수준비" 상태 사례가 실질적으로 없고
-- (13개 지점 약 220건 전수 조사 — 전부 이미 접수가능 상태) 접수 시작 시각 필드
-- 자체가 없다. 그래서 롯데마트 찜은 순수 "관심 강좌 저장" 용도이고, 알람 발송
-- 대상이 되지는 않는다. 다만 "찜/알람은 같은 기능" 정책(이벤트+이마트 캡 합산)에서
-- 롯데마트 찜까지 같이 캡에 포함시킬지는 bookmarks.ts에서 결정한다(알람 유무와
-- 무관하게 "무분별한 찜 등록 방지"라는 캡의 원래 취지는 동일하게 적용).
alter table public.user_bookmarks
  add column if not exists lottemart_class_id text references public.lottemart_culture_club_classes(class_id) on delete cascade;

alter table public.user_bookmarks drop constraint if exists user_bookmarks_exactly_one_target;
alter table public.user_bookmarks
  add constraint user_bookmarks_exactly_one_target check (
    num_nonnulls(spot_id, event_id, emart_class_id, lottemart_class_id) = 1
  );

create unique index if not exists uniq_user_bookmarks_lottemart_class
  on public.user_bookmarks (user_id, lottemart_class_id) where lottemart_class_id is not null;
