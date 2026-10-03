-- [찜/알람 — 이마트 문화센터 클래스까지 확장](2026-10-03 사용자 지시): "문화센터
-- 데이터는 별도 테이블로 관리하고, 찜/알람은 같은 기능이니깐 두 테이블 데이터 전부
-- 참조할 수 있도록 확장" — emart_culture_club_classes는 그대로 독립 테이블로 두고
-- (daily 상태 변경/브랜드 확장/is_excluded 관리자 큐레이션이 events 파이프라인과
-- 섞이지 않도록), user_bookmarks만 세 번째 nullable FK로 넓힌다(기존 spot_id/
-- event_id 패턴 그대로 확장 — 제5장 제4조 기존 구조 우선).
--
-- class_id(text, unique)를 참조한다 — emart_culture_club_classes의 실제 PK는
-- bigint id지만, 이 테이블의 모든 다른 참조(관리자 라우트, 수집 스크립트 upsert
-- onConflict)가 전부 class_id를 안정적인 자연키로 쓰고 있어 동일하게 맞춘다.
alter table public.user_bookmarks
  add column if not exists emart_class_id text references public.emart_culture_club_classes(class_id) on delete cascade;

-- 2-way exclusive-or 체크를 3-way로 교체한다. num_nonnulls()는 Postgres 내장
-- 함수로 "정확히 N개만 non-null"을 깔끔하게 표현한다(OR 체인보다 3개 이상일 때
-- 가독성이 낫다).
alter table public.user_bookmarks drop constraint if exists user_bookmarks_exactly_one_target;
alter table public.user_bookmarks
  add constraint user_bookmarks_exactly_one_target check (
    num_nonnulls(spot_id, event_id, emart_class_id) = 1
  );

create unique index if not exists uniq_user_bookmarks_emart_class
  on public.user_bookmarks (user_id, emart_class_id) where emart_class_id is not null;

-- [예약 오픈 알람 — 문화센터 클래스 발송 대상 추적](2026-10-03): events.
-- reservation_open_reminder_sent_at과 동일한 "이미 이 시각 기준으로 발송했는지"
-- 중복 발송 방지 컬럼. emart_culture_club_classes.register_start_at(오늘 이미
-- 추가됨, 실제 접수 시작 시각 — events의 관리자 수동 입력 next_reservation_open_at과
-- 달리 자동 파싱값)과 비교해 사용한다.
alter table public.emart_culture_club_classes
  add column if not exists reservation_open_reminder_sent_at timestamptz;
