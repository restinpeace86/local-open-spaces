-- Task 9-1-12 (2026-08-22): 특별시/광역시 구 단독 표기("동구"/"북구"/"중구" 등)는 서울·부산·
-- 대구·인천·광주·대전·울산에 전부 존재해 어느 도시인지 알 수 없다(실측 확인, 사용자 지적).
-- schema-mapper.mjs/extract-district.ts의 extractSigunguName()을 "시/도 축약명 + 구" 2단
-- 표기로 보완한 것과 동일한 규칙을 기존 데이터에도 일괄 반영한다.

-- 1) open_spaces: 주소가 있는 전체 행을 새 규칙으로 재계산.
UPDATE open_spaces
SET sigungu_name = (
  CASE
    WHEN parsed.token1 ~ '(시|군)$' AND parsed.token2 ~ '구$' THEN parsed.token1 || ' ' || parsed.token2
    WHEN parsed.token1 ~ '(시|군)$' THEN parsed.token1
    WHEN parsed.token1 ~ '구$' THEN
      CASE parsed.province
        WHEN '서울특별시' THEN '서울시 ' || parsed.token1
        WHEN '부산광역시' THEN '부산시 ' || parsed.token1
        WHEN '대구광역시' THEN '대구시 ' || parsed.token1
        WHEN '인천광역시' THEN '인천시 ' || parsed.token1
        WHEN '광주광역시' THEN '광주시 ' || parsed.token1
        WHEN '대전광역시' THEN '대전시 ' || parsed.token1
        WHEN '울산광역시' THEN '울산시 ' || parsed.token1
        WHEN '세종특별자치시' THEN '세종시 ' || parsed.token1
        ELSE parsed.token1
      END
    ELSE NULL
  END
)
FROM (
  SELECT
    id,
    (regexp_split_to_array(trim(address), '\s+'))[1] AS province,
    (regexp_split_to_array(trim(address), '\s+'))[2] AS token1,
    (regexp_split_to_array(trim(address), '\s+'))[3] AS token2
  FROM open_spaces
) AS parsed
WHERE open_spaces.id = parsed.id;

-- 2) events(TOUR_API_*): venue_name이 실제 주소(addr1)라 동일 규칙으로 재계산 가능.
UPDATE events
SET sigungu_name = (
  CASE
    WHEN parsed.token1 ~ '(시|군)$' AND parsed.token2 ~ '구$' THEN parsed.token1 || ' ' || parsed.token2
    WHEN parsed.token1 ~ '(시|군)$' THEN parsed.token1
    WHEN parsed.token1 ~ '구$' THEN
      CASE parsed.province
        WHEN '서울특별시' THEN '서울시 ' || parsed.token1
        WHEN '부산광역시' THEN '부산시 ' || parsed.token1
        WHEN '대구광역시' THEN '대구시 ' || parsed.token1
        WHEN '인천광역시' THEN '인천시 ' || parsed.token1
        WHEN '광주광역시' THEN '광주시 ' || parsed.token1
        WHEN '대전광역시' THEN '대전시 ' || parsed.token1
        WHEN '울산광역시' THEN '울산시 ' || parsed.token1
        WHEN '세종특별자치시' THEN '세종시 ' || parsed.token1
        ELSE parsed.token1
      END
    ELSE NULL
  END
)
FROM (
  SELECT
    id,
    (regexp_split_to_array(trim(venue_name), '\s+'))[1] AS province,
    (regexp_split_to_array(trim(venue_name), '\s+'))[2] AS token1,
    (regexp_split_to_array(trim(venue_name), '\s+'))[3] AS token2
  FROM events
  WHERE external_id LIKE 'TOUR_API_%' AND venue_name IS NOT NULL
) AS parsed
WHERE events.id = parsed.id;

-- 3) events(SEOUL_CULTURE_*/SEOUL_YEYAK_*): venue_name은 시설명일 뿐 주소가 아니라 재계산할
--    수 없다 — 대신 이미 저장된 sigungu_name(GUNAME/AREANM 원본값, 서울 구 이름 단독)이 항상
--    서울 소속임을 소스 자체로 알고 있으므로 "서울시 " 접두만 붙인다(이미 붙어 있으면 건너뜀).
UPDATE events
SET sigungu_name = '서울시 ' || sigungu_name
WHERE (external_id LIKE 'SEOUL_CULTURE_%' OR external_id LIKE 'SEOUL_YEYAK_%')
  AND sigungu_name IS NOT NULL
  AND sigungu_name NOT LIKE '서울시 %';
