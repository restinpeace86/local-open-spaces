# 서울시 공공서비스예약 타임존 버그 수정 + 예약 오픈 알림 자동 동기화

## 구현 대상
사용자 지시(2026-09-22): "events 쪽에 들어있는 데이터들에 대하여 예약알림쪽에
수동으로 예약시간 등록되도록 되어있는데 seoul_reservation쪽은 예약
시간있는걸로 알고 있거든? 해당 예약 시간을 넣는건 좀 그렇나? 한번 검토해줘."

## 검토 결과 및 실측
- `seoul_public_reservation`(서울시 공공서비스예약, SVCID 기반) 소스는 이미
  실제 접수 시작/종료 시각(RCPTBGNDT/RCPTENDDT)을 정부 API로부터 수집하고
  있었다 — 기존 `next_reservation_open_at`(예약 오픈 알림) 수동 입력 체계는
  "규칙 자체를 코드로 추측하면 안 되는" 서울형키즈카페 같은 유형을 위한
  것이었지, 이 소스처럼 이미 확인된 실제 시각이 있는 경우까지 수동 입력을
  강제할 이유는 없었다.
- 실측(운영 DB): 전체 6,285건 중 (당시 잘못된 타임존 기준으로도) 미래
  시각인 건이 110건, 그중 `next_reservation_open_at`이 채워진 건 **0건** —
  이미 있는 데이터를 재입력해야만 알림 기능이 켜지는 비효율이 실제로
  존재했다.

## 검토 중 발견한 별도 버그 (타임존)
`RCPTBGNDT`/`RCPTENDDT` 원본이 "2026-08-25 09:00:00.0"처럼 **시간대 표시가
없는 한국시간(KST) 문자열**인데, 이걸 그대로 timestamptz 컬럼에 넣어
Postgres가 UTC로 잘못 해석하고 있었다 — 실측(raw_data 원본과 저장값 직접
대조): 정확히 9시간 밀려 저장됨을 확인. 이는 **이미 사용자 화면에도
영향을 주고 있었다** — 이벤트 상세의 "마감: OOO" 표시
(`formatDateTime(reservation_end_date)`)가 실제보다 9시간 늦게 보이는
상태였다. 사용자 확인 후("타임존 버그 먼저 고치고 이어서 진행") 두 작업을
함께 진행했다.

## 변경 사항

### 1) 타임존 버그 수정
- `scripts/ingest/lib/kst-date-range.mjs`: `kstNaiveDatetimeToUtcIso(raw)`
  신규 — "YYYY-MM-DD HH:mm:ss[.f]" 형식의 시간대 없는 문자열을 KST로 명시적
  해석해 UTC ISO 문자열로 변환한다. 형식이 다르면(추측 금지) null.
- `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`: `reservationStartDate`/
  `reservationEndDate`를 `item.RCPTBGNDT || null` 그대로 넘기던 것을
  `kstNaiveDatetimeToUtcIso(item.RCPTBGNDT)`로 변환해서 넘기도록 수정.
- `scripts/migrations/2026-09-22-fix-seoul-yeyak-reservation-timezone.sql`
  (1회성 백필): 기존에 이미 잘못 저장된 `seoul_public_reservation` 소스의
  `reservation_start_date`/`reservation_end_date`를 전부 `-9시간` 산술
  보정(항상 같은 방향/크기로 밀려 있어 raw_data 재파싱 없이 안전하게 보정
  가능).

### 2) 예약 오픈 알림 자동 동기화
- `scripts/ingest/adapters/lib/schema-mapper.mjs`의 `buildEventRow`에
  `nextReservationOpenAt` 파라미터 추가(기본값 null — 다른 어댑터는 영향
  없음).
- `seoul-yeyak-adapter.mjs`: 보정된 `reservationStartDateIso`가 **미래
  시각**이면 그 값을 `next_reservation_open_at`으로 함께 넘긴다. 이미
  지난 시각이면(예약이 이미 열림) null — 규칙을 추측하는 게 아니라 이미
  확인된 실제 데이터를 그대로 재사용하는 것이라 제3장 제5조(추측 금지)에
  저촉되지 않는다고 판단(사용자 확인).
- **서울형키즈카페/공공키즈카페는 이 자동 동기화에서 명시적으로 제외**했다
  — 이 두 카테고리는 별도 사용자 지시(2026-09-20)로 "자치구별 시차를 두는
  공지 기반 규칙"을 관리자가 수동 입력하도록 이미 확정돼 있고, RCPTBGNDT가
  이 카테고리에서도 같은 의미로 쓰이는지 확인된 바 없어(추측 금지) 기존
  결정과 충돌하지 않게 그대로 수동 입력 체계를 유지했다.
- `scripts/ingest/lib/supabase-admin.mjs`의 `ALWAYS_REFRESH_FIELDS.events`에
  `next_reservation_open_at` 추가 — 그래야 seoul-yeyak-adapter가 매일 계산한
  최신 값이 upsertRowsSafeMerge의 "기존 값 보존" 규칙에 막히지 않고 계속
  갱신된다(null로 넘어오면 기존 값을 보존하므로 다른 소스/관리자가 수동
  입력해둔 값은 지워지지 않음).
- 위 마이그레이션에 기존 데이터 1회성 반영도 포함: 타임존 보정 후
  `reservation_start_date`가 미래이고 아직 `next_reservation_open_at`이
  비어 있는(서울형/공공키즈카페 제외) 이벤트에 즉시 값을 채워, 다음 배치를
  기다리지 않고 지금 바로 알림 기능이 켜지게 했다.

## 검증
- `npx tsc --noEmit` / `npm run test`(198개 파일 2289개, 신규 5개 —
  타임존 보정 확인, 미래/과거 케이스, 키즈카페 제외, 형식 없음 안전 처리) /
  `npm run build` 모두 통과.
- **실측(운영 DB, 마이그레이션 적용 후 재조회)**:
  - 원본 RCPTBGNDT("2026-08-04 10:00:00.0")와 보정된 저장값
    ("2026-08-04T01:00:00+00:00" = KST 10:00)을 여러 건 직접 대조해 정확히
    보정됐음을 확인.
  - `next_reservation_open_at`이 채워진 건수: 143건(기존 수동 입력, 그대로
    유지) → **237건**(94건 자동 신규 반영, 143+94=237 정합).
  - 서울형키즈카페/공공키즈카페의 `next_reservation_open_at` 건수는 정확히
    143건 그대로 — 자동 동기화가 이 카테고리를 건드리지 않았음을 확인
    (첫 확인 시 `.limit(5)` 실수로 5건으로 잘못 나왔다가, 카운트 쿼리로
    재확인해 143건임을 바로잡았다).

## 특이 사항
- 사용자 화면의 "마감: OOO" 표시(이 소스의 예약 종료 시각)가 이 수정
  이전까지 9시간 늦게 보이고 있었다는 뜻이라, 서비스 운영 관점에서도 이번
  발견의 의미가 크다.
- 다른 서울시 계열 어댑터(seoul-culture-events.mjs 등)가 비슷한 naive
  datetime 문자열을 쓰는지는 이번 범위에서 확인하지 않았다 — 필요하면
  별도로 점검할 수 있다.
