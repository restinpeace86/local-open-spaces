-- [동적 연령 추천 시스템 — min_age_recommended](2026-09-10 사용자 지시,
-- implementation/todo.md 개선사항1 "동적 연령 추천 시스템 (min_age_recommended)"):
-- "만 x세 이상 뱃지 / 기본값 0 (미지정 시 뱃지 미노출)". 관리자가 블로그 후기를
-- 검수하며 "초등 이상"·"영유아 어려움"·명시 연령 등의 맥락으로 이 스팟을 만 몇
-- 세부터 추천할지를 숫자로 저장한다. 0이면 소비자(스팟픽) 화면에서 "만 x세 이상"
-- 뱃지를 노출하지 않는다.
--
-- 기존 spot_curations 행은 전부 0(미지정)으로 채워진다 — 뱃지 자동 체크와 동일하게
-- 관리자가 검수하며 개별로 값을 채워 넣는 세미오토 방식이라 백필하지 않는다.
alter table public.spot_curations
  add column if not exists min_age_recommended smallint not null default 0;

-- 만 0~19세 범위로 제한한다(그 밖의 값은 오입력). 0 = 미지정/미노출.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'spot_curations_min_age_recommended_range'
  ) then
    alter table public.spot_curations
      add constraint spot_curations_min_age_recommended_range
      check (min_age_recommended >= 0 and min_age_recommended <= 19);
  end if;
end $$;

comment on column public.spot_curations.min_age_recommended is
  '이 스팟을 추천하는 최소 만 나이(0 = 미지정, 소비자 화면에서 "만 x세 이상" 뱃지 미노출). todo.md 개선사항1 동적 연령 추천 시스템.';
