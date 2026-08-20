-- project/database_schema.md 3.2: events 테이블에 정의되어 있으나 초기 마이그레이션에 누락되어 있던
-- is_free 컬럼을 추가한다 (get_nearby_spaces_and_events RPC 및 Quick Filter '🎁 무료 이용' 스크리닝에 필요).

alter table public.events
  add column if not exists is_free boolean not null default false;
