-- Decision 017 후속 수정(2026-08-25, 같은 날 실적용 중 발견): 이전 삭제(2026-08-25-decision-017-
-- purge-stale-seoul-yeyak-events.sql)에서 KIDS_ACTIVITY/ETC만 지우고 PERFORMANCE_FESTIVAL(1088건,
-- 옛 DIV '문화행사'를 강제 매핑한 결과)은 "events에 남아도 되는 정상 분류"로 판단해 남겨뒀다.
--
-- 그런데 upsertRowsSafeMerge()의 COALESCE(existing, incoming) 시맨틱 때문에, event_type처럼
-- 이미 non-null인 컬럼은 재수집해도 새 값(EXPERIENCE_CLASS)으로 절대 갱신되지 않고 기존 값
-- (PERFORMANCE_FESTIVAL)이 영구히 고정된다는 것을 실제 재수집(2026-08-25 20:03) 후 확인했다
-- (safe-merge는 "재파싱이 놓친 값을 되돌리지 않는" 용도지, "의도적 재분류"에는 맞지 않는 도구).
-- 새 코드(MAXCLASSNM 기반)는 이 데이터에 대해 PERFORMANCE_FESTIVAL을 절대 생성하지 않으므로
-- (문화체험/교육강좌 → EXPERIENCE_CLASS로 통일), 이 값이 남아있는 한 "완전히 정화"(Decision
-- 017 7항/9항)가 되지 않는다. 삭제 후 재수집하면 새 코드가 EXPERIENCE_CLASS로 새로 삽입한다.
DELETE FROM public.events
WHERE external_id LIKE 'SEOUL_YEYAK_%'
  AND event_type = 'PERFORMANCE_FESTIVAL';
