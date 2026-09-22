-- [예약 오픈 알림 자동 동기화 검토 중 발견한 타임존 버그 수정](2026-09-22 사용자
-- 지시로 검토): 서울시 공공서비스예약 API(RCPTBGNDT/RCPTENDDT)는 시간대 표시가
-- 없는 한국시간(KST) 문자열("2026-08-25 09:00:00.0")을 내려주는데, 어댑터
-- (scripts/ingest/adapters/seoul-yeyak-adapter.mjs)가 이를 그대로 timestamptz
-- 컬럼에 넣어 Postgres가 UTC로 잘못 해석해왔다 — 실측: raw_data의 원본 RCPTBGNDT와
-- 저장된 reservation_start_date를 직접 대조해 정확히 9시간 밀려 있음을 확인했다.
-- 항상 같은 방향/크기로 밀려 있으므로(어댑터가 예외 없이 이 경로 하나만 써옴) 단순
-- 산술 보정(-9시간)으로 안전하게 되돌릴 수 있다 — raw_data를 다시 파싱할 필요 없음.
--
-- 코드 쪽 수정(scripts/ingest/adapters/seoul-yeyak-adapter.mjs,
-- scripts/ingest/lib/kst-date-range.mjs의 kstNaiveDatetimeToUtcIso)은 이후
-- 재수집부터는 올바르게 저장되도록 이미 반영했다 — 이 마이그레이션은 그 전에 이미
-- 쌓여 있던 기존 행들을 1회성으로 바로잡는다.
update public.events
set reservation_start_date = reservation_start_date - interval '9 hours',
    reservation_end_date = reservation_end_date - interval '9 hours'
where source = 'seoul_public_reservation'
  and (reservation_start_date is not null or reservation_end_date is not null);

-- [예약 오픈 알림 자동 동기화 — 기존 110건 즉시 반영](2026-09-22 사용자 지시): 위
-- 보정이 끝난 reservation_start_date가 지금 시점 기준 미래인 이벤트는, 다음 배치를
-- 기다리지 않고 지금 바로 next_reservation_open_at을 채워 알림 기능을 즉시 켠다.
-- 서울형키즈카페/공공키즈카페는 별도 결정(2026-09-20)으로 수동 입력 체계를 유지하므로
-- 제외하고, 이미 관리자가(또는 다른 경로로) next_reservation_open_at을 채워둔 행은
-- 덮어쓰지 않는다.
update public.events
set next_reservation_open_at = reservation_start_date
where source = 'seoul_public_reservation'
  and reservation_start_date > now()
  and next_reservation_open_at is null
  and coalesce(category_min, '') not in ('서울형키즈카페', '공공키즈카페');
