-- [출생 연+월 정밀화](todo.md 개선사항 4): "기존에 아이의 '출생 연도'만
-- 수집하던 자녀 프로필 입력 단계를 '몇 년 몇 월생'까지 상세히 수집" —
-- 기존 birth_years(integer[])는 그대로 두고(이미 10여 개 파일이 "연 나이"
-- 계산에 그대로 쓰고 있어 깨뜨리지 않는다, 제5장 제4조), 같은 인덱스로
-- 대응하는 birth_months(integer[])를 병렬 컬럼으로 추가한다.
alter table public.profiles
  add column birth_months integer[] not null default '{}';
