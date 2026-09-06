-- [RowPicker "노출 중분류 미지정만 보기" 추가 후 조회 타임아웃](2026-09-06 사용자
-- 지시): "키즈/놀이시설의 어린이놀이시설(실내)때 0건나오고 canceling statement due
-- to statement timeout 떠"
--
-- 실측 원인(EXPLAIN ANALYZE): RowPicker가 새로 보낸 category_min + only_unmapped
-- (service_category_id IS NULL) 조합 + created_at DESC 정렬 + LIMIT 50 쿼리에서,
-- 플래너가 idx_open_spaces_created_at(정렬만 지원)을 골라 일치하지 않는 행
-- 53,156건을 순서대로 걸러내며 스캔하다 15초 넘게 걸렸다:
--
--   Index Scan using idx_open_spaces_created_at ...
--     Filter: (service_category_id IS NULL) AND (category_min = '...')
--     Rows Removed by Filter: 53156
--     Execution Time: 15310.325 ms
--
-- 기존에 category_min 단일 컬럼 인덱스(idx_open_spaces_category_min)와
-- service_category_id 단일 컬럼 인덱스는 있었지만, "이 두 조건 + 정렬"을 한 번에
-- 지원하는 인덱스가 없어 이 조합만 느렸다(only_unmapped 없이 category_min만 쓰는
-- 기존 조회는 계속 빨랐던 이유). RowPicker의 실제 쿼리 패턴(미지정 행만, category_
-- min별로, 최신순)에 정확히 맞춘 부분 인덱스를 추가한다 — service_category_id가
-- NULL인 행만 대상으로 하는 부분 인덱스라 전체 인덱스보다 작고 효율적이다.
create index if not exists idx_open_spaces_category_min_created_at_unmapped
  on public.open_spaces (category_min, created_at desc nulls last)
  where service_category_id is null;
