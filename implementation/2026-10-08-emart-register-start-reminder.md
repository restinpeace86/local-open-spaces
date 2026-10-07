# 이마트 접수시작 10분 전 사전 알림

## 구현 대상
사용자 지시(2026-10-08): 롯데마트 `search_reg_status=1` 고정(대기자신청
포기) 트레이드오프를 재확인하는 대화 중 — "접수마감 전꺼에 대하여 빠른
알림과 실시간 알림이 더중요해" → (기존에 "신청시작하자마자" 알림은 이미
있다고 안내 후) "마감임박 보다 신청시작전 혹은 신청시작하자마자 뜨는게
중요한데.. 마감임박 전환시 푸시발송도 나쁘진 않고" → 리드타임 확인 질문에
"10분전 괜찮겠지".

## 구현 일시
2026-10-08

## 현황 정리(구현 전 확인한 것)
- "신청시작하자마자"(사후 반응형) 알림은 이미 있었다 —
  `culture-club-status-watch.mjs`가 5분마다 찜한 강좌를 재확인해 상태가
  액션 가능(이마트: 접수중/정원마감, 롯데마트: 바로신청/대기자신청)으로
  막 바뀐 순간 푸시를 보낸다. 이번에 새로 만든 건 이게 아니라 "시작 전"
  사전 알림이다.
- "마감임박" 알림은 사용자가 우선순위를 낮게 두어 보류했다(실측 확인:
  롯데마트 상세페이지엔 마감임박 신호가 전혀 없어 목록 페이지를 별도로
  더 조회해야 하는 구조적 비용이 있다 — 이번 범위에 포함하지 않음).
- "신청시작 전" 사전 알림은 **이마트만 가능하다** — `register_start_at`
  (접수 시작 시각)을 이마트만 파싱해 저장한다(`classDateInfo.
  classRegisterStartDate`). 롯데마트/현대백화점은 `culture-club-unified-
  row.mjs`에 이미 "이 개념 자체가 없다"(실측 확인, 사이트에 노출 안 됨)로
  기록돼 있어 항상 null — 사전 알림 대상이 될 수 없다(추측으로 만들지
  않음, 제3장 제5조).

## 변경 사항
- `scripts/migrations/2026-10-08-culture-club-register-reminder-sent-at.sql`
  (적용 완료): `culture_club_classes.register_reminder_sent_at timestamptz`
  추가 — 5분 주기로 도는 신규 배치가 같은 강좌에 중복 발송하지 않도록
  발송 여부를 표시한다. `npm run gen:types`로 타입 재생성.
- `scripts/ingest/lib/culture-club-push.mjs`(신규): `culture-club-status-
  watch.mjs`에만 있던 "찜한 유저에게 웹푸시 보내기" 로직
  (`sendPushToBookmarkers`/`configureWebPush`)을 공유 모듈로 뺐다(제5장
  제4조 — 두 번째 스크립트가 같은 로직을 다시 베끼지 않도록). 기존엔
  title이 "🔔 찜한 강좌 접수 가능"으로 고정돼 있었는데, 사전 알림은 아직
  접수 전이라 다른 문구가 필요해 title/body를 호출부가 넘기도록만
  바꿨다 — 조회 대상(찜한 유저 중 등급 필터)·발송·만료 구독 정리 로직은
  그대로다.
- `scripts/ingest/culture-club-status-watch.mjs`: 로컬 복제본을 지우고
  위 공유 모듈을 import하도록 교체(동작 변화 없음, title/body 값 동일).
- `scripts/ingest/emart-culture-club-register-reminder.mjs`(신규): 5분
  마다 "지금부터 10~15분 뒤 register_start_at인 이마트 강좌"(5분 창,
  `computeReminderWindow()`)를 조회해 찜한 유저에게 "⏰ 찜한 강좌 접수
  예정" 푸시를 보내고 `register_reminder_sent_at`을 찍어 중복 발송을
  막는다. `is_excluded=false`만 대상, `--dry-run` 지원(발송/DB쓰기 없이
  대상만 출력).
- `scripts/ingest/emart-culture-club-register-reminder.test.mjs`(신규):
  `computeReminderWindow` 단위 테스트(창 경계, 연속 실행 간 창이 빈틈/
  중복 없이 이어지는지).
- `LocalOpenSpaces-EmartRegisterReminder`(작업 스케줄러, 매 5분, 09:03
  시작) 신규 등록.

## 검증
- `npx tsc --noEmit` / `npm run test`(283개 파일 2,935개) / `npm run build`
  전부 통과.
- 라이브 조회로 쿼리 정확성 실측 확인: 실제 DB에 있는 과거
  `register_start_at='2026-10-07T01:00:00+00:00'` 행 6건을 대상으로, 그
  시각의 12분 전을 `now`로 주입해(10~15분 창 안에 들어오게) `--dry-run`
  으로 실행 → 정확히 그 6건이 조회됨을 확인(발송/DB쓰기 없음). 실제
  "지금" 기준으로는 미래 `register_start_at`을 가진 강좌가 현재 하나도
  없어(전부 과거) 실환경에서 당장 발송되는 건은 없다 — 다음 신규
  강좌(접수대기 상태로 미래 시각이 잡힌 것)가 수집되면 자연히 동작한다.

## 특이 사항
- `configureWebPush()`를 dry-run일 땐 호출하지 않는다(VAPID 키가 없는
  환경에서도 조회만 해볼 수 있게).
- 창 폭을 리드타임(10분)과 분리해 5분으로 둔 이유: 5분 주기 실행과
  정확히 맞물려야 "정확히 한 번만" 창에 걸린다(창이 주기보다 좁으면
  실행 사이 틈에 빠질 수 있고, 넓으면 `register_reminder_sent_at` 가드가
  없었다면 중복 발송된다 — 지금은 가드가 있어 안전하지만 창 자체도
  주기와 맞춰 불필요한 중복 조회를 줄였다).
