# 공공키즈카페/서울형키즈카페 next_reservation_open_at 매일 자동 재계산

## 구현 대상
사용자 지시(2026-09-27): "어 이거는 일단 매주발생하는거니깐 예약시간을
규칙안내화면과 같이 매주 화요일로 해줄래?" + reservation_start_date/
reservation_end_date 필드값을 붙여넣으며 "다음 예약 오픈 시각(수동 입력)에는
2026-09-22 01:00 이건 뭐 키즈카페 지역에 따라 다르고"라고 지적.

## 배경/실측
- `raw_data.RCPTBGNDT/RCPTENDDT`(reservation_start_date/end_date)는 매번
  갱신되는 값이 아니다 — 실측 확인 결과 공공키즈카페 행의 이 필드가
  "2026-08-25~2026-09-07"(2주 접수기간)로 이미 3주 전에 끝난 값인데도
  `updated_at`은 "2026-09-26"으로 최근에 재수집됐다. 즉 소스 API가 이 필드를
  주기적으로 새 값으로 안 바꿔준다 — 어댑터(`seoul-yeyak-adapter.mjs`)가 이미
  이 두 카테고리를 `isManualOnlyKidsCafeCategory`로 자동 동기화 대상에서 뺀
  기존 판단이 실측으로도 맞았음을 재확인했다.
- 반면 "다음 예약 오픈 시각"은 서울시 공지문(자치구별 그룹 요일/시각)이 이미
  확정돼 있고 매주 그대로 반복된다 — 직전에 admin 화면에 참고표로만 노출해둔
  규칙([[2026-09-27-reservation-open-rule-reference-panel]])을 이번엔 실제
  자동 계산 로직으로 승격한다.

## 변경 사항
### 신규: `scripts/ingest/lib/kids-cafe-reservation-rule.mjs`
- `computeNextReservationOpenAt(categoryMin, sigunguName, now)`: 공공키즈카페
  (화요일 09/11/13/15시, 25개구)/서울형키즈카페(월요일 10/12/14/16시, 21개구)
  매핑표로 "다음 돌아오는 요일:시각"을 계산한다. 두 1회성 시드 스크립트
  (`2026-09-20-seed-*-next-reservation-open-at.mjs`)의 로직을 그대로 재사용.
  규칙 범위 밖(자치구 불명/다른 카테고리)이면 null(추측 금지).
- `refreshKidsCafeReservationOpenAt(client, now)`: 두 카테고리 전건을 조회해
  계산값이 현재 저장값과 실제로(시각 기준, 문자열 포맷 아님) 다를 때만
  `next_reservation_open_at`을 갱신하고 `reservation_open_reminder_sent_at`을
  null로 리셋한다 — **값이 같으면 아예 UPDATE를 안 해서, 이미 발송한 회차가
  매일 재실행마다 "미발송"으로 조용히 리셋되는 사고를 막는다**(이번 설계의
  핵심 안전장치).

### `scripts/ingest/run-daily.mjs`
- `REFRESH_KIDS_CAFE_RESERVATION_OPEN_AT` 후처리 단계 추가(DEACTIVATE_EXPIRED_
  EVENTS 다음) — 매일 배치 실행마다 이 규칙으로 재계산한다. SEOUL_YEYAK가 이미
  category_min/sigungu_name을 RAW로 채워두므로 다른 단계 성공 여부에 의존하지
  않는 독립 단계.

### 화면 안내 갱신
- `src/components/admin/data-grid-client.tsx`: 규칙 참고표 안내문을 "자동으로
  다시 계산되지 않으며..."에서 "매일 배치가 이 규칙으로 자동 재계산한다(수동
  수정해도 다음 배치 때 덮어써짐)"로 수정 — 방금 추가한 자동화와 안내문이
  어긋나지 않도록.
- `src/components/admin/raw-data-modal.tsx`의 `ReservationOpenAtEditor`:
  공공키즈카페/서울형키즈카페 행에서는 "매일 배치가 서울시 공지문 규칙으로
  자동 재계산합니다.. 여기서 수동으로 고쳐도 다음 배치 때 그 규칙값으로 다시
  덮어써집니다"라는 안내문으로 교체(그 외 카테고리는 기존 문구 유지) — 관리자가
  이 두 카테고리에서 수동 입력이 무의미해질 수 있다는 걸 미리 알게 한다.

### 실제 DB 반영(1회 즉시 실행)
다음 배치(내일)까지 기다리지 않고, 이번 변경 직후 `refreshKidsCafeReservation
OpenAt`을 실제 DB에 1회 실행했다:
- 스캔 279건(공공키즈카페 270 + 서울형키즈카페 9), 갱신 146건, 스킵 133건
  (sigungu_name 없는 기존 레거시 행, 자동 재계산 대상 아님 — 이전과 동일).
- 결과 확인: 두 카테고리 전부 `next_reservation_open_at`이 미래 값으로
  전환됨(공공키즈카페: 2026-09-29 09~15시 KST, 서울형키즈카페: 2026-09-28
  10~16시 KST) — 어드민 그리드의 "예약 오픈 알림" 컬럼이 전부 "예정"으로
  바뀐다.

## 검증
- `scripts/ingest/lib/kids-cafe-reservation-rule.test.mjs`(신규 10개): 순수
  계산 함수(정상 계산/이미 지난 시각의 롤오버/범위 밖 null 3종) + 배치
  함수(값 변경 시 갱신+리셋/값 동일 시 미터치/자치구 불명 스킵/카테고리 필터링).
- `src/components/admin/raw-data-modal.test.tsx`(신규 2개): 공공키즈카페 행은
  자동 재계산 안내문, 그 외 카테고리는 기존 수동 갱신 안내문.
- `npx tsc --noEmit` / `npm run test`(207개 파일 2,413개) / `npm run build`
  모두 통과.

## 특이 사항
- 이 두 카테고리에 대해서는 이제 `ReservationOpenAtEditor`로 수동 입력해도
  다음 날 배치가 규칙대로 다시 덮어쓴다 — 서울시가 그룹 구성을 또 바꾸면
  개별 행이 아니라 `kids-cafe-reservation-rule.mjs`의 매핑표(그리고 admin
  참고표 `RESERVATION_OPEN_RULE_REFERENCE`)를 함께 고쳐야 한다.
- `sigungu_name`이 없는 133건(레거시 데이터, 좌표만 있고 주소 문자열 없음)은
  이번에도 자동 재계산 대상에서 빠진다 — 필요하면 주소/좌표 기반 자치구
  역보강 작업을 먼저 해야 한다(이전 시드 스크립트 때와 동일한 한계).
