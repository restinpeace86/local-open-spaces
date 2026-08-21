-- Task 9-1-1: events 테이블에 장소명(venue_name) 컬럼 추가.
-- 배경: Task 9-1에서 발견한 Mismatch — events 테이블에는 장소 텍스트 컬럼이 없고
-- space_id FK도 전량 미기재라 이벤트 카드에 "장소"를 표시할 방법이 없었다.
-- 원본 API가 실제로 제공하는 장소명 필드(seoul-culture-events.mjs의 PLACE,
-- seoul-yeyak-adapter.mjs의 PLACENM, tour-api-festival.mjs의 addr1)를 저장할 컬럼을 추가한다.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_name TEXT;
