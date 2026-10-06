-- [일정/스케줄 정규화](todo.md 개선사항 3): 이미 있는 class_start_date(YYYYMMDD
-- 텍스트)/class_day(한글 요일 배열) 등은 그대로 두고, Date 타입/표준 요일 코드/
-- 회차/차수를 담을 병렬 컬럼을 추가한다(기존 컬럼을 쓰는 코드를 깨지 않기 위한
-- 비파괴적 확장, 제5장 제4조/제7조).
alter table public.emart_culture_club_classes
  add column schedule_start_date date,
  add column schedule_end_date date,
  add column schedule_days_code text[],
  add column round integer,
  add column total_sessions integer;

alter table public.lottemart_culture_club_classes
  add column schedule_start_date date,
  add column schedule_end_date date, -- 롯데마트는 원천 데이터에 종료일이 없어 항상 null
  add column schedule_days_code text[],
  add column round integer, -- 롯데마트는 차수 개념이 없어 항상 null(스펙 본문도 인정)
  add column total_sessions integer; -- 기존 session_count 값을 그대로 복사(공통 스키마 이름 통일 목적)
