-- [이마트 컬처클럽 강좌 상세정보 1회성 수집](2026-10-03 사용자 지시): "하나의
-- 강좌에 대하여 한번만 상세페이지꺼 가져와서 채우면돼.. 중요한거 변해야하고
-- 캐치해야하는게 그 status 이거 하나야" — 상세설명/이미지는 한 번 등록되면 거의
-- 안 바뀌는 정적 콘텐츠라, class_id당 딱 한 번만 가져오고 다시 긁지 않는다
-- (status는 이미 매일 도는 목록 배치가 계속 갱신함 — 이 컬럼들과는 무관).
--
-- detail_fetched_at을 "이미 시도했는지" 판정 기준으로 쓴다(content가 빈 문자열인
-- 정상 케이스도 실측으로 확인했기 때문 — content is null/empty로는 "아직 시도
-- 안 함"과 "시도했는데 원래 비어있음"을 구분할 수 없다).
alter table public.emart_culture_club_classes
  add column if not exists class_detail_title text,
  add column if not exists class_detail_content text,
  add column if not exists main_image_bucket text,
  add column if not exists main_image_region text,
  add column if not exists main_image_key text,
  add column if not exists detail_fetched_at timestamptz;

create index if not exists idx_emart_culture_club_classes_detail_pending
  on public.emart_culture_club_classes (id)
  where detail_fetched_at is null;
