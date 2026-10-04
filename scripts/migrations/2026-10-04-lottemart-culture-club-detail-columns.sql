-- [롯데마트 문화센터 강좌 상세정보 1회성 수집](2026-10-04 사용자 지시): "상세정보
-- 롯데마트 문화센터는 클래스 상세정보같은거왜 안나와? 관리자화면에서.. 강좌코드나
-- 강의실이나 강좌소개나 강좌수강 Tip이랄던가 상세들어가면 다 있던데" — 목록
-- 응답(searchList.do)에는 없고 상세 페이지(courseview.do)의 "강좌정보" 표에만
-- 있는 4개 필드를 추가한다(이마트의 emart-culture-club-detail.mjs와 동일한
-- "class_id당 한 번만 수집하는 정적 콘텐츠" 패턴 — 상태처럼 매일 바뀌는 값이
-- 아니라 한 번만 가져오면 된다).
alter table public.lottemart_culture_club_classes
  add column if not exists class_code text,
  add column if not exists classroom text,
  add column if not exists class_intro text,
  add column if not exists class_tip text,
  add column if not exists detail_fetched_at timestamptz;

create index if not exists idx_lottemart_culture_club_classes_detail_fetched_at
  on public.lottemart_culture_club_classes (detail_fetched_at)
  where detail_fetched_at is null;
