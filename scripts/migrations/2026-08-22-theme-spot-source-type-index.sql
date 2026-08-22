-- Task 9-5-1(2026-08-22): 목적별 테마 스팟 큐레이션 쿼리(source_type IN (...) ORDER BY
-- created_at DESC LIMIT 500)가 실제로 인덱스를 타도록 한다.
-- 실측 확인 1차: source_type 컬럼에 인덱스가 전혀 없어(idx_open_spaces_category/
-- idx_open_spaces_sigungu_name 등은 이미 있음) source_type.in.(...) 조건조차 순차 스캔으로
-- 처리돼, ILIKE 키워드 조건과 함께 걸면 statement timeout이 발생했다.
-- 실측 확인 2차: source_type 단일 컬럼 인덱스만 추가했더니, 매칭 건수가 매우 큰 소스
-- (LOCALDATA_PLAYGROUND, 82,373건)는 인덱스로 걸러낸 뒤에도 ORDER BY created_at DESC 정렬을
-- 위해 8~9만 건을 통째로 정렬해야 해서 여전히 9초 이상 걸렸다(타임아웃). source_type과
-- created_at을 함께 넣은 복합 인덱스로 바꾸니 정렬 없이 바로 상위 500건을 훑어 30ms 내로
-- 끝남을 확인했다 — 그래서 단일 컬럼 인덱스 대신 이 복합 인덱스 하나만 둔다(선행 컬럼이
-- source_type이라 source_type 단독 필터링에도 그대로 쓰인다).
CREATE INDEX IF NOT EXISTS idx_open_spaces_source_type_created_at
  ON open_spaces (source_type, created_at DESC);
