-- [5번째 접수상태 추가 — 현장접수](2026-10-04 사용자 지시): "접수상태/수강신청쪽에
-- 상태쪽은 어떤것들이 있지?" — 60개 지점 × 대상 3 × 학기 2 전체(15,101행)를
-- 전수 스캔해 처음 설계 때 놓쳤던 5번째 상태 "현장접수"(14건, 희귀하지만 실재)를
-- 발견했다. 기존 파서는 이걸 기본 폴백인 '접수마감'으로 잘못 분류하고 있었다
-- (scripts/ingest/lottemart-culture-club.mjs의 parseRegistrationStatus 수정과
-- 짝을 이루는 스키마 변경 — 코드만 고치고 CHECK 제약을 안 넓히면 재수집 시
-- insert가 거부된다).
alter table public.lottemart_culture_club_classes drop constraint if exists lottemart_culture_club_classes_registration_status_check;
alter table public.lottemart_culture_club_classes
  add constraint lottemart_culture_club_classes_registration_status_check check (
    registration_status in ('바로신청', '대기자신청', '접수마감', '전화문의', '현장접수')
  );
