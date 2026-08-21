-- Task 8-4 정밀 검증에서 발견: public.events.is_free가 NOT NULL 제약이 있어(문서에는 미기재),
-- SEOUL_CULTURE 소스처럼 원본에 요금 정보가 애매한(무료/유료 어느 쪽도 아닌) 소수 레코드에
-- is_free: null(정보 미기재)을 저장하려 하면 배치 전체가 실패한다.
-- spec/space/space-card.md는 is_free === null을 "정보 미기재/알 수 없음 → 요금 뱃지 숨김"으로
-- 명시적으로 정의하며, public.open_spaces.is_free는 이미 NULL을 허용한다 — 두 테이블의 제약이
-- 서로 다른 것은 의도된 설계가 아니라 사양과 어긋난 제약이므로 open_spaces와 일치시킨다.
ALTER TABLE public.events ALTER COLUMN is_free DROP NOT NULL;
