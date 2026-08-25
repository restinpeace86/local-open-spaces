-- Decision 017(2026-08-25) 7항/9항: 개편 이전 DIV 기준으로 잘못 분류돼 있던 서울시 예약
-- 데이터(SEOUL_YEYAK_*)를 events 테이블에서 삭제한다.
--   - event_type = 'KIDS_ACTIVITY' (596건): 옛 DIV '체육시설'을 강제로 KIDS_ACTIVITY로
--     매핑했던 결과. 이제는 open_spaces 테이블에 별도 적재되어야 하는 데이터다.
--   - event_type = 'ETC' (610건): 옛 DIV '시설대관'(→ 이제 MAXCLASSNM '공간시설', open_spaces
--     대상)과 '진료'(→ 이제 MAXCLASSNM '진료복지', 수집 범위 제외 대상)가 구분 없이 섞여
--     있었다. events 테이블에는 원본 DIV/MAXCLASSNM이 보존돼 있지 않아(source/raw_data 컬럼이
--     이번에야 추가됨) 사후적으로 둘을 구분할 방법이 없다 — 임의로 재구성하지 않고(제3장 제5조
--     추측 금지) 전량 삭제 후 원본 API 재수집으로 정확히 재구성한다.
-- 사용자 확인(2026-08-25): "삭제 후 즉시 재수집" — 원본 API가 살아있어 데이터 유실이 아니라
-- 재정렬이며, 삭제 직후 같은 세션에서 node scripts/ingest/seoul-public-reservation.mjs를 실행해
-- 새 기준(MAXCLASSNM 기반 테이블 분리)으로 즉시 재적재한다.
DELETE FROM public.events
WHERE external_id LIKE 'SEOUL_YEYAK_%'
  AND event_type IN ('KIDS_ACTIVITY', 'ETC');
