-- [가격 및 입장료 스마트 파싱](2026-09-08 사용자 지시, todo.md 개선사항1-3):
-- "어린이 요금, 보호자 요금 등의 필드에 숫자가 자동으로 쪼개져 매핑되도록" —
-- spot_curations에는 이미 image_url/operating_hours/menu_items가 있지만
-- 입장료(대상별 요금) 컬럼은 없었다. 관리자가 수정·저장할 수 있어야 하므로
-- NULL 허용 정수 컬럼으로 추가한다(파싱 실패 시 추측해서 채우지 않고 NULL로
-- 남기는 기존 파서 원칙과 일치).
alter table public.spot_curations
  add column if not exists child_fee integer,
  add column if not exists guardian_fee integer;

comment on column public.spot_curations.child_fee is '어린이/아동 입장료(원). 파싱 실패/미입력 시 NULL.';
comment on column public.spot_curations.guardian_fee is '보호자/성인 입장료(원). 파싱 실패/미입력 시 NULL.';
