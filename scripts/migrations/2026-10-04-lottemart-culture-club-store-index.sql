-- [성능 버그 수정 — 실측 확인](2026-10-04 사용자 지적): "문화센터를 이벤트픽
-- 화면에서 들어갔었는데... 왜이렇게 느려졌지?" 조사 중 발견한 두 번째 원인 —
-- /api/culture-club/lottemart-classes가 매 지점 선택마다
-- `.eq('store_code', ...).eq('is_excluded', false).order('class_start_date')`
-- 로 조회하는데, store_code에 인덱스가 전혀 없어 15,000여 행 전체를 순차
-- 스캔하고 있었다(실측: 0.67초, 테이블이 더 커질수록 계속 느려질 구조).
-- 첫 번째 원인(지점 목록 API가 15,000행을 전부 훑던 문제)은 코드 레벨에서
-- 고쳤고(정적 상수로 교체), 이건 DB 레벨 수정.
create index if not exists idx_lottemart_culture_club_classes_store_code
  on public.lottemart_culture_club_classes (store_code, is_excluded);
