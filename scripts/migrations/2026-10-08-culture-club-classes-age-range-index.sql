-- [문화센터 검색 성능 — DB 인덱스 부재 진단/수정](2026-10-08 todo.md 개선사항1
-- 사용자 지시): "WHERE 조건으로 자주 쓰는 필터 컬럼(개월 수 관련 컬럼 등)에
-- 인덱스가 제대로 걸려있는지 점검해주세요."
--
-- [실측 확인] 위치 파라미터가 없는 조회 경로(/api/culture-club/search의
-- !hasLocation 분기 — brand+age_months 필터 후 schedule_start_date로
-- 정렬)를 EXPLAIN (ANALYZE, BUFFERS)로 실측한 결과, min_age_months/
-- max_age_months에 인덱스가 전혀 없어 culture_club_classes 전체
-- 23,991건을 Seq Scan으로 훑고 있었다(4,242ms). min_age_months/
-- max_age_months 복합 인덱스를 추가하자 플래너가 기존
-- idx_culture_club_classes_brand_status와 함께 BitmapAnd/BitmapOr로
-- 조합해 75ms로 끝났다(56배 단축, 실측 재확인).
create index if not exists idx_culture_club_classes_age_range
  on public.culture_club_classes (min_age_months, max_age_months);
