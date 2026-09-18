-- [facility_type 기본값 결함 수정](2026-09-19 사용자 지시): "default를 복합으로 한게
-- 잘못된거야.. unknown 혹은 null로 놔야돼 실내인지 야외인지 혹은 복합인지 판단이
-- 안되면." — 이전엔 events/open_spaces.facility_type이 NOT NULL DEFAULT '복합'이라
-- "실제로 실내외 둘 다 확인된 복합 시설"과 "애초에 판별을 시도한 적도 없음"을 DB에서
-- 구분할 수 없었다(실측 2026-09-17: events 28,948건 중 22,118건이 이 결함으로
-- 미판별 방치 상태). '복합'은 실제로 둘 다 확인된 경우에만 쓰는 확정값으로 좁히고,
-- 미판별은 null로 정직하게 남긴다(spec/data/ai-rule.md 5.2-4 개정).
--
-- 코드 레벨(scripts/ingest/lib/ai-tagging.mjs의 deriveParentalTags,
-- scripts/ingest/adapters/lib/schema-mapper.mjs의 normalizeFacilityType/기본
-- 파라미터, playground/swimming-pool/rural-education-farm 어댑터의 개별 '복합'
-- 하드코딩)는 이미 null을 반환/전달하도록 고쳤다 — 이 마이그레이션은 DB 컬럼
-- 정의 자체를 그 코드 변경과 일치시킨다.
alter table public.events
  alter column facility_type drop not null,
  alter column facility_type drop default;

alter table public.open_spaces
  alter column facility_type drop not null,
  alter column facility_type drop default;
