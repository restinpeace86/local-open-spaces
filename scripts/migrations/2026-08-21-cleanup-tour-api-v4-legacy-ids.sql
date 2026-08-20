-- KorPetTourAdapter/KorWithTourAdapter가 KOR_TOUR_API_V4_{contentid} 통합 스키마로
-- 이관되면서 남은 구 external_id 스킴(KOR_PET_TOUR_*, KOR_WITH_TOUR_*) 잔여 행 정리.
-- 사용자 확인(2026-08-21): "contentid 기준으로 통합(중복제거) 권장"
DELETE FROM public.open_spaces
WHERE external_id LIKE 'KOR_PET_TOUR_%' OR external_id LIKE 'KOR_WITH_TOUR_%';
