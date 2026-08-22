-- Task 9-1-3 (2026-08-22): open_spaces.sigungu_name 백필.
-- 이미 저장된 address 컬럼에서 계산 가능하므로(외부 API 재수집 불필요), DB 단에서
-- schema-mapper.mjs의 extractSigunguName()와 동일한 로직으로 한 번에 채운다.
-- 규칙(실측 확인, project/CLAUDE.md 추측 금지 준수): 한국 주소는
-- "{시/도} {시/군/구} {상세...}" 순서. 서울/광역시는 2번째 토큰이 바로 구("서울특별시 강남구"),
-- 경기도 등 일부 시는 2·3번째 토큰을 합쳐야 함("경기도 성남시 분당구"). 판별 불가면 NULL.
UPDATE open_spaces
SET sigungu_name = (
  CASE
    WHEN parsed.token2 ~ '(시|군)$' AND parsed.token3 ~ '구$' THEN parsed.token2 || ' ' || parsed.token3
    WHEN parsed.token2 ~ '(시|군)$' THEN parsed.token2
    WHEN parsed.token2 ~ '구$' THEN parsed.token2
    ELSE NULL
  END
)
FROM (
  SELECT
    id,
    (regexp_split_to_array(trim(address), '\s+'))[2] AS token2,
    (regexp_split_to_array(trim(address), '\s+'))[3] AS token3
  FROM open_spaces
) AS parsed
WHERE open_spaces.id = parsed.id;
