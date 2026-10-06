-- [찜 FK 통합 — 2단계](project/decision-log.md Decision 028): 백필 스크립트로
-- 확인한 결과 emart_class_id/lottemart_class_id에 값이 있는 기존 북마크
-- 행이 0건이었다(실측 확인, orphan 걱정 없이 바로 정리 가능) — 두 컬럼을
-- 제거하고 culture_club_class_id 하나로 CHECK 제약을 바꾼다.
alter table public.user_bookmarks
  drop constraint user_bookmarks_exactly_one_target;

alter table public.user_bookmarks
  drop column emart_class_id,
  drop column lottemart_class_id;

alter table public.user_bookmarks
  add constraint user_bookmarks_exactly_one_target check (
    num_nonnulls(spot_id, event_id, culture_club_class_id) = 1
  );
