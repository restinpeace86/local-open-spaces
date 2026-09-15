-- [관리자 대시보드 '오늘 반영 현황' 집계 속도 개선](2026-09-15 사용자 지시,
-- implementation/todo.md [개선사항 4]): "오늘 갱신(events_updated_today)" 카드가
-- `events.updated_at`에 gte 필터를 거는데, 이 컬럼에는 인덱스가 전혀 없어(실측 확인
-- — pg_indexes에 updated_at 관련 행 자체가 없었음) 매번 전체 테이블을 스캔했다.
-- 이미 존재하는 idx_events_created_at과 동일한 패턴(단독 컬럼, desc, nulls last)으로
-- 추가한다.
create index if not exists idx_events_updated_at on public.events (updated_at desc nulls last);
