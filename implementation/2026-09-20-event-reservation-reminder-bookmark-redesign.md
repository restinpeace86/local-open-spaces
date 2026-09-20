# [예약 오픈 알림 재설계 — 찜(북마크) 연동으로 단순화]

## 구현 대상
사용자 지시(2026-09-20): "내 알림신청목록은 찜했을때 찜한것에 대하여만 알림오도록
하는거지.." — 직전에 만든 별도 구독 버튼/테이블(`event_reservation_reminders`,
[[2026-09-20-event-reservation-open-reminder-push]])을 없애고, 이미 있는
찜(`user_bookmarks`)을 그대로 구독 신호로 재사용하도록 재설계.

## 구현 일시
2026-09-20

## 설계 결정 — 등급 정책 충돌 발견 및 해소
찜(북마크)은 이미 열심맘(`active`) 이상만 가능하다(`src/lib/community/grades.ts`
`canBookmark`). 반면 직전 구현은 예약 오픈 알림을 "로그인만 하면 누구나"로
정했었다 — 찜에 알림을 얹으면 이 둘이 충돌한다는 걸 확인하고 물었더니, 사용자가
"알림도 열심맙 이상만(정책 바꿈)"으로 확정했다. 기존 나드리픽 푸시
(`canReceivePushNotifications`, 우수맘/`excellent` 이상)와는 다른, 한 단계 낮은
문턱이다 — 서로 다른 기능이라 별도 기준을 쓰는 게 맞다고 판단했다(찜이 가능한
사람이면 이 알림도 받을 수 있어야 자연스러움).

## 코드 변경
### 제거
- `event_reservation_reminders` 테이블(0건 상태였음, 데이터 손실 없이 안전하게
  drop) — `scripts/migrations/2026-09-20-drop-event-reservation-reminders-table.sql`.
- `src/lib/push/event-reservation-reminder.ts`(구독/해제/상태조회 함수 3개) 삭제.
- `src/components/common/event-reservation-reminder-button.tsx`(별도 벨 버튼) 삭제.

### 추가/변경
- `src/components/common/event-reservation-reminder-hint.tsx`(신규):
  `EventReservationReminderHint` — 별도 액션 버튼이 아니라 "찜하면 이런 혜택이
  있다"는 안내 문구만 담당한다. 실제 찜 액션은 기존 `BookmarkButton`(이미 이벤트
  상세에 렌더링돼 있었음, `detail-modal.tsx:671`)이 그대로 처리한다. 찜 버튼과
  동일한 등급 기준(`canBookmark`)으로 자기완결적으로 표시 여부를 판단해, 찜
  버튼이 안 보이는 유저에게 "찜하면 알림 온다"는 문구만 보이는 불일치를 막았다.
- `src/components/map/detail-modal.tsx`: `EventReservationReminderButton` →
  `EventReservationReminderHint`로 교체.
- `scripts/ingest/event-reservation-reminder-push-batch.mjs`: 구독자 조회를
  `event_reservation_reminders` → `user_bookmarks`(event_id로 조회)로 변경하고,
  `mom-pick-push-send-batch.mjs`와 동일한 패턴(profiles/push_subscriptions는
  형제 FK라 PostgREST 임베디드 조회 불가 — 2단계 조회)으로 등급을 `active`
  이상(`canBookmark`와 동일 기준)으로 필터링하는 로직을 추가했다.

### 안정화(발견된 부수 이슈)
배치를 실제 DB로 스모크 테스트하던 중 `next_reservation_open_at` 범위 조회가
`statement timeout`을 낸 걸 실측으로 발견했다(28,948건+ 테이블에 인덱스 없음).
`scripts/migrations/2026-09-20-events-next-reservation-open-at-index.sql`
(신규)로 부분 인덱스(`where next_reservation_open_at is not null`, 대부분
null이라 부분 인덱스로 충분) 추가 후 재실행해 정상 종료 확인.

## 검증
- `npx tsc --noEmit`/`npm run test`(170개 파일, 2045개 테스트, 회귀 없음)/
  `npm run build`(신규 라우트 `/api/events/reservation-open-at`,
  `/api/admin/data-grid/reservation-open-at`는 그대로 유지되고, 삭제된 컴포넌트
  참조가 없어 빌드 성공) 모두 통과.
- 마이그레이션(테이블 drop, 인덱스 추가) 적용 후 `node scripts/gen-types.mjs`로
  타입 재생성.
- 배치 스크립트를 실제 DB 대상으로 재실행해 정상 종료(대상 이벤트 0건) 확인 —
  실제 발송 경로(웹 푸시 전송 자체)는 실제 유저의 기기 구독이 필요해 이번에는
  라이브 발송까지는 검증하지 않았다(기존 `subscribe.ts`/`push-notification-
  toggle.tsx`도 동일한 이유로 단위 테스트가 없는 코드베이스 관례를 따름).

## 특이 사항
- `/api/events/reservation-open-at`(공개 조회), `/api/admin/data-grid/
  reservation-open-at`(관리자 수동 입력)는 이번 재설계와 무관하게 그대로
  유지된다 — 관리자가 "다음 예약 오픈 시각"을 입력하는 방식 자체는 안 바뀌었고,
  바뀐 건 "누가 알림을 받는가"를 결정하는 구독 메커니즘뿐이다.
