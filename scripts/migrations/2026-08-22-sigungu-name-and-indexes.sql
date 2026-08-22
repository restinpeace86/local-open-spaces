-- Task 9-1-3 (2026-08-22): 실시간 Haversine 거리 계산 제거 → sigungu_name 기반 인덱스 조회로 전환.
-- open_spaces/events 양쪽에 sigungu_name(시/군/구) 컬럼을 추가하고, 주요 조회 컬럼에 인덱스를 건다.

ALTER TABLE open_spaces ADD COLUMN IF NOT EXISTS sigungu_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sigungu_name TEXT;

CREATE INDEX IF NOT EXISTS idx_open_spaces_is_free ON open_spaces (is_free);
CREATE INDEX IF NOT EXISTS idx_open_spaces_category ON open_spaces (category);
CREATE INDEX IF NOT EXISTS idx_open_spaces_sigungu_name ON open_spaces (sigungu_name);

CREATE INDEX IF NOT EXISTS idx_events_is_free ON events (is_free);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_sigungu_name ON events (sigungu_name);
