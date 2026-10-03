-- [관리자/테스트 계정 등급 고정](2026-10-03 사용자 지시): "이 계정.. 현재 내 계정은
-- 관리자 계정이니 그냥 예외처리로 파워맘으로 해줘 모든 기능들 볼수있어야할거아니야" —
-- 실적 기반 매일 배치 재계산과 무관하게 특정 계정의 등급을 고정할 수 있는 컬럼을
-- 추가한다. not null이면 mom-pick-grade-batch.mjs가 그 값을 그대로 쓰고 실적 재계산을
-- 건너뛴다(일반 유저는 전부 null — 이 컬럼이 존재한다는 사실 자체가 "이 계정은
-- 예외"라는 걸 테이블만 봐도 알 수 있게 한다, 배치 코드에 숨겨진 유저ID 하드코딩보다
-- 투명함).
alter table public.profiles
  add column if not exists grade_override text
    check (grade_override is null or grade_override in ('signed_up', 'sprout', 'active', 'excellent', 'power'));

comment on column public.profiles.grade_override is
  '관리자/테스트 계정용 등급 고정. not null이면 mom-pick-grade-batch.mjs가 실적 기반
   재계산을 건너뛰고 이 값을 그대로 profiles.grade에 반영한다. 일반 유저는 null.';

-- 사용자 본인 계정(goodguy0515@gmail.com, 닉네임 "하린맘") — 오늘 등급 문의를 주고받은
-- 그 계정 — 을 파워맘으로 고정한다.
update public.profiles
set grade_override = 'power', grade = 'power', grade_updated_at = now()
where id = '799c25c1-ec22-407f-b208-45f64fcdcb98';
