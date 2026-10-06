-- [찜 FK 통합 — 1단계](project/decision-log.md Decision 028): user_bookmarks의
-- emart_class_id/lottemart_class_id(브랜드가 늘어날수록 컬럼이 계속 늘어나는
-- 구조)를 culture_club_class_id 하나로 통합하는 첫 단계. 이번 마이그레이션은
-- 컬럼만 추가한다 — 기존 emart_class_id/lottemart_class_id 컬럼과 CHECK
-- 제약은 전혀 건드리지 않는다(데이터 백필·검증 후 별도 마이그레이션에서 정리).
alter table public.user_bookmarks
  add column culture_club_class_id bigint references public.culture_club_classes(id) on delete cascade;

create index if not exists idx_user_bookmarks_culture_club_class_id
  on public.user_bookmarks (user_id, culture_club_class_id) where culture_club_class_id is not null;
