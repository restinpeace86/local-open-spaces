-- Task 9-6-20 (2026-08-25, Decision 013): 이벤트픽 6대 카테고리 개편 백필.
-- PERFORMANCE_FESTIVAL / EXHIBITION_MUSEUM은 이름이 그대로 유지되어 손대지 않는다.
-- open_spaces.category는 이 결정 범위 밖이라(Decision 010: 스팟픽=상시 공간 전용 테이블 분리)
-- 건드리지 않는다 — 스팟픽은 여전히 schema-mapper.mjs의 기존 5대 UI_CATEGORY를 그대로 쓴다.
--
-- EXPERIENCE_CLASS(체험·클래스 통합값)는 📚 클래스 vs 🎨 체험로, KIDS_ACTIVITY(키즈·액티비티
-- 통합값)는 👶 키즈 vs 🏟️ 공공시설 예약으로 갈라져 값 하나로 기계적 치환이 불가능하다 — DB에
-- 남아있는 실제 제목 텍스트에 spec/data/ai-rule.md 3.3의 키워드 목록을 그대로 적용해(추측이
-- 아닌 원문 근거 기반) 재분류한다. 어느 키워드에도 안 걸리면 각 통합값에서 더 일반적인 쪽
-- (EXPERIENCE_CLASS→CLASS, KIDS_ACTIVITY→FACILITY_RESERVATION)으로 보수적으로 떨어뜨린다 —
-- 이 두 값을 실제로 만들어온 어댑터(seoul-yeyak '교육'/'체육시설', gg-culture-events '교육')가
-- 이미 이 방향에 더 가까운 텍스트를 다뤄왔기 때문이다. OUTDOOR_NATURE는 events.event_type으로
-- 쓰인 적이 없는 것으로 실측 확인됐으나(2026-08-25), 안전망으로 함께 포함한다.
--
-- 매일 새벽 배치(ETL)가 재수집할 때마다 각 어댑터가 이미 새 6대 카테고리로 직접 태깅하므로,
-- 이 백필은 개편 시점 이전에 적재된 기존 행만 정정하면 된다. scripts/ingest/ai-tagger.mjs의
-- retagIncompleteEvents()도 동일한 레거시 값을 감지해 AI로 재분류하므로, 이 SQL 백필과
-- ai-tagger.mjs 정기 실행 중 먼저 도달하는 쪽이 값을 정정한다.

UPDATE events
SET event_type = CASE
  WHEN event_type = 'EXPERIENCE_CLASS' AND (
    title ILIKE '%만들기%' OR title ILIKE '%원데이%' OR title ILIKE '%농장체험%' OR
    title ILIKE '%숲체험%' OR title ILIKE '%공예%' OR title ILIKE '%주말체험%' OR title ILIKE '%실습%'
  ) THEN 'EXPERIENCE'
  WHEN event_type = 'EXPERIENCE_CLASS' THEN 'CLASS'
  WHEN event_type = 'KIDS_ACTIVITY' AND (
    title ILIKE '%어린이%' OR title ILIKE '%영유아%' OR title ILIKE '%키즈%' OR
    title ILIKE '%유아%' OR title ILIKE '%아동%'
  ) THEN 'KIDS'
  WHEN event_type = 'KIDS_ACTIVITY' THEN 'FACILITY_RESERVATION'
  WHEN event_type = 'OUTDOOR_NATURE' THEN 'EXPERIENCE'
  ELSE event_type
END
WHERE event_type IN ('EXPERIENCE_CLASS', 'KIDS_ACTIVITY', 'OUTDOOR_NATURE');
