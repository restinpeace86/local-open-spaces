-- [챗봇 카테고리 체계 동기화](2026-09-03) v3(-prefilter-v3.sql, st_dwithin + category_min
-- 조합을 BitmapAnd로 결합)를 적용한 뒤, category_min의 btree 인덱스와 location의 GiST
-- 인덱스를 별도로 유지하는 것보다 하나의 결합 GiST 인덱스로 두 조건을 한 번에 커버하면
-- 더 빠를 것이라는 가설을 세우고 실측으로 검증했다. btree_gist 확장을 켜면 GiST
-- 인덱스에 텍스트 등치 조건(category_min)도 공간 연산자와 함께 담을 수 있다.
--
-- 실측 결과: EXPLAIN ANALYZE로 확인한 planner는 이 새 인덱스를 실제로 사용했다
-- (`Bitmap Index Scan on idx_open_spaces_category_min_location_geography`,
-- Index Cond가 category_min과 location 두 조건을 모두 포함). 하지만 KIDS_CAFE(어린이
-- 놀이터류, 전국 약 7.1만 건)처럼 매칭 행 자체가 절대적으로 많은 경우(40km 반경 기준
-- 28,482건)에는 이 결합 인덱스로도 유의미한 개선이 없었다 — 병목이 "어떤 인덱스로
-- 후보를 찾느냐"가 아니라 "매칭된 행 자체를 얼마나 많이 힙에서 읽어야 하느냐"이기
-- 때문이다(결합 인덱스든 BitmapAnd든 최종적으로 읽어야 하는 힙 행 수는 동일하다).
-- 이 인덱스는 결합 인덱스 자체가 나쁜 선택은 아니고(다른 카테고리들에서는 여전히
-- 정상적으로 쓰이며 회귀는 없다) 실제 해결책은 아니었으므로, KIDS_CAFE의 최종 해결은
-- 애플리케이션 레벨의 조회 반경 상한으로 별도 적용했다
-- (search-engine.ts의 getEffectiveQueryRadiusMeters, DENSE_VIBE_QUERY_RADIUS_CAP_METERS
-- 참고). 이 인덱스 자체는 계속 유효하고 도움이 되므로 유지하되, 지금까지 세션 도중
-- `npx supabase db query`로 라이브 DB에만 적용하고 저장소에는 기록되지 않았던 것을
-- 이 마이그레이션 파일로 캡처한다(실제 스키마 변경은 이미 적용 완료 상태 — 이 파일은
-- 재현/추적용 기록이다).
create extension if not exists btree_gist;

create index if not exists idx_open_spaces_category_min_location_geography
  on public.open_spaces
  using gist (category_min, ((location)::geography));
