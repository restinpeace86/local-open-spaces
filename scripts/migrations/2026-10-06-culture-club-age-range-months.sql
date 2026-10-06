-- [연령 표기 → 개월 수 정규화](todo.md 개선사항 2): 이마트/롯데마트 강좌의
-- 제각각인 연령 표기(세/년생/개월)를 파싱해 정형화된 정수 컬럼으로 적재한다.
-- scripts/ingest/lib/age-range-parser.mjs의 parseAgeRangeToMonths() 결과를
-- 담는다 — 파싱 불가/정보 없음은 null(제3장 제5조, 추측으로 채우지 않음).
alter table public.emart_culture_club_classes
  add column min_age_months integer,
  add column max_age_months integer,
  add constraint emart_culture_club_classes_age_range_check
  check (min_age_months is null or max_age_months is null or max_age_months >= min_age_months);

alter table public.lottemart_culture_club_classes
  add column min_age_months integer,
  add column max_age_months integer,
  add constraint lottemart_culture_club_classes_age_range_check
  check (min_age_months is null or max_age_months is null or max_age_months >= min_age_months);
