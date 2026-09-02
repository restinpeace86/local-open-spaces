-- [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): 파워맘/우수맘 추천 카드에 "작성자의
-- 닉네임과... 등급 배지 필수 표시"가 요구되는데, profiles에는 표시 가능한 이름 필드가
-- 없었다(birth_years/grade뿐). 사용자가 직접 설정하는 표시용 닉네임 컬럼을 추가한다 —
-- 실명/이메일을 그대로 노출하지 않기 위한 최소한의 공개 식별자다.
alter table public.profiles
  add column if not exists nickname text;
