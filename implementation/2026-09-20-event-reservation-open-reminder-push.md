# [예약 오픈 알림 — 이벤트별 구독 + 오픈 10분 전 웹 푸시]

## 구현 대상
사용자 지시(2026-09-20): "지금 SVCURL 들어가보면.. 사전예약이 80%라서 지금 예약
오픈일에 맞추어서 사전에 예약 오픈전 10분전이라던가 앱 푸시 주는기능을 만들고
싶은데?"

## 확인된 제약 및 결정
- 실제 서울형키즈카페 "예약 순차적 개시 안내" 공지문 2건(2026-04/2026-09 시행)을
  받아본 결과, 오픈 시각이 "매주 월요일 10시" 같은 단일 규칙이 아니라 **자치구별로
  시차를 둔 권역/그룹** 구조이고, 그 그룹 구성 자체가 시기별로 바뀐 이력이 있다.
  이를 코드에 하드코딩하면 서울시가 규칙을 또 바꾸는 순간 조용히 틀린 알림이
  나간다(제3장 제5조 추측 금지) — **관리자가 이벤트마다 "다음 예약 오픈 시각"을
  직접 입력**하는 방식으로 시작한다(사용자 확인).
- 재크롤링 결과 자동 반영과 달리(spot-curation-refresh와는 별개 기능), 예약 오픈
  알림은 순수 관리자 수동 입력 + 발송 배치로 구성된다.
- 구독(신청) 조건: "로그인만 하면 누구나"(사용자 확인) — 기존 나드리픽 푸시의
  우수맘 등급 제한과 다르다.
- **정밀도에 대한 정직한 기록**: 발송 배치는 GitHub Actions 스케줄(cron)로 10분마다
  실행된다. GitHub Actions 공식 문서가 "스케줄 트리거는 정확한 시각 실행을 보장하지
  않으며 부하가 높을 때 지연될 수 있다"고 명시하므로, "정확히 10분 전"이 아니라
  "약 5~15분 전" 사이에 발송된다(창을 실행 주기보다 넓게 잡아 놓침 방지).

## 구현 일시
2026-09-20

## DB 스키마
`scripts/migrations/2026-09-20-event-reservation-open-reminder.sql`(적용 완료):
- `events.next_reservation_open_at timestamptz`: 관리자 수동 입력.
- `events.reservation_open_reminder_sent_at timestamptz`: 발송 배치의 중복 방지용
  — `next_reservation_open_at`과 정확히 같으면 "이미 이 회차 처리함"으로 간주.
  관리자가 다음 회차 시각으로 갱신(PATCH)하면 값이 달라져 자연히 다시 발송 대상이
  된다.
- `event_reservation_reminders` 테이블(신규): `event_id, user_id` — "이 유저가 이
  이벤트를 구독했는가"만 기록. 실제 기기별 푸시 구독 정보(`push_subscriptions`,
  기존 나드리픽 인프라 재사용)는 `user_id`로 조인한다. RLS: 본인 행만 CRUD
  (`user_bookmarks`/`push_subscriptions`와 동일 관례, 등급 제한 없음).

## 코드 변경
### 관리자 — 다음 예약 오픈 시각 수동 입력
- `src/app/api/admin/data-grid/reservation-open-at/route.ts`(신규): `PATCH
  { id, next_reservation_open_at }` — 값이 바뀌면 `reservation_open_reminder_sent_at`을
  함께 null로 되돌린다.
- `src/components/admin/raw-data-modal.tsx`: `ReservationOpenAtEditor`(신규,
  datetime-local 입력 + "오픈 시각 저장" 버튼) — `events` 탭 전용, 기존
  `CategoryMinEditor`/`FacilityTypeEditor`/`TitleEditor`와 동일한 UI 패턴.
- `src/components/admin/data-grid-client.tsx`: `AdminEventRow`에
  `next_reservation_open_at` 필드 추가, `EVENTS_COLUMNS`에 select 컬럼 추가,
  `onReservationOpenAtUpdated` 콜백으로 저장 성공 시 목록/상세 모달 즉시 갱신.

### 유저 — 이벤트 상세에서 알림 신청
- `src/app/api/events/reservation-open-at/route.ts`(신규): `GET ?event_id=X` —
  공개 조회(다음 오픈 시각만, 서비스 롤 클라이언트로 조회).
- `src/lib/push/event-reservation-reminder.ts`(신규): `subscribeToEventReminder`/
  `unsubscribeFromEventReminder`/`isSubscribedToEventReminder` — 기존
  `src/lib/push/subscribe.ts`(기기별 푸시 구독)와 동일한 "클라이언트가 RLS로 직접
  CRUD" 패턴(서버 API 라우트 없이 브라우저 Supabase 클라이언트 사용). 구독 시
  `subscribeToPush(null)`로 이 기기의 웹 푸시 구독을 먼저 보장한 뒤,
  `event_reservation_reminders`에 신청 행을 추가한다.
- `src/components/common/event-reservation-reminder-button.tsx`(신규):
  `EventReservationReminderButton` — `next_reservation_open_at`이 있고 아직
  지나지 않은 이벤트에서만 렌더링, 기존 `PushNotificationToggle`과 동일한 UI
  언어(토글 버튼 + 에러 메시지).
- `src/components/map/detail-modal.tsx`: EVENT 분기의 `SpotNoticesSection` 바로
  아래에 `<EventReservationReminderButton eventId={item.id} />` 추가(이
  기능은 이벤트 전용 개념이라 SPACE 분기에는 추가하지 않음).

### 발송 배치
- `scripts/ingest/event-reservation-reminder-push-batch.mjs`(신규): 10분마다
  실행, `next_reservation_open_at`이 지금부터 5~15분 사이인 이벤트를 조회 →
  구독자(`event_reservation_reminders` → `push_subscriptions` 조인, 등급 필터
  없음) 전원에게 웹 푸시 발송(기존 `mom-pick-push-send-batch.mjs`와 동일한
  `web-push`/VAPID 설정, 410/404 만료 구독 자동 정리) → 성공 여부와 무관하게
  `reservation_open_reminder_sent_at`을 갱신해 중복 발송을 막는다.
- `.github/workflows/event-reservation-reminder-push-batch.yml`(신규):
  `cron: '*/10 * * * *'`, 기존 `mom-pick-push-send-batch.yml`과 동일한 시크릿
  구성.

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2041개 테스트 — 신규 4개:
  `ReservationOpenAtEditor`의 저장/null 저장/실패/미노출)/`npm run build` 모두
  통과. 마이그레이션은 `node scripts/apply-sql.mjs`로 적용, `node
  scripts/gen-types.mjs`로 타입 재생성.
- 발송 배치를 실제 DB 대상으로 1회 실행(`node scripts/ingest/
  event-reservation-reminder-push-batch.mjs`) — 아직 관리자가 입력한 이벤트가
  없어 "대상 이벤트 0건" 정상 종료 확인(예외 없음).
- 푸시 발송 자체(client subscribe.ts/PushNotificationToggle과 동일한 영역)는
  이 코드베이스 관례상 브라우저 Push API 의존성 때문에 단위 테스트를 두지 않는다
  (기존 `subscribe.ts`/`push-notification-toggle.tsx`도 테스트 파일 없음, 동일
  관례 유지).

## 특이 사항
- "10분 전" 정밀도는 GitHub Actions 스케줄의 구조적 한계로 "약 5~15분 전"이다 —
  더 정밀한 트리거(예: 별도 상시 실행 서버, Vercel Cron 유료 티어의 짧은 주기 등)가
  필요하면 별도 검토가 필요하다.
- 관리자가 `next_reservation_open_at`을 갱신하지 않으면(예: 다음 주 회차를 깜빡하고
  안 채우면) 그 회차는 알림이 나가지 않는다 — 자동 반복 계산을 넣지 않기로 한
  결정의 직접적인 트레이드오프다.
