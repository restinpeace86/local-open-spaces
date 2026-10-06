-- [상태/강사명 정규화](todo.md 개선사항 5): 두 마트가 서로 다른 상태 모델을
-- 쓰고 있어, 마트 전체를 가로지르는 조회를 위해 공통 3단계 ENUM을 추가한다.
-- url/fee/materialFee는 이미 해결돼 있어(프론트엔드 URL 빌더/정수 컬럼)
-- 이번 마이그레이션에 포함하지 않는다.
alter table public.emart_culture_club_classes
  add column instructor_name text, -- class_title에서 파싱(전용 필드 없음, 실측 확인)
  add column normalized_status text check (normalized_status in ('OPEN', 'CLOSED', 'WAITING'));

alter table public.lottemart_culture_club_classes
  add column normalized_status text check (normalized_status in ('OPEN', 'CLOSED', 'WAITING'));
  -- 롯데마트는 instructor_name이 이미 있어 추가하지 않는다.
