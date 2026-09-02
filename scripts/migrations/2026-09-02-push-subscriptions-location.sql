-- [Decision 019](2026-09-02) 보강: 우수맘 이상 "맞춤형 큐레이션 푸시 알람"은 "거주 지역"
-- 조건과 연계해야 하는데, 서버에서 매칭하려면 구독 시점의 위치를 함께 저장해야 한다.
-- 기존 use-user-location.ts(LocalStorage 기반 사용자 위치)를 구독 시점에 그대로 스냅샷
-- 떠서 보낸다 — 실시간 추적이 아니라 "구독한 순간의 위치" 1회성 스냅샷임을 명확히 한다
-- (제3장 제5조 추측 금지 — 실시간 위치 추적 인프라는 이번 Decision에 없어 만들지 않음).
alter table public.push_subscriptions
  add column if not exists lat double precision,
  add column if not exists lng double precision;
