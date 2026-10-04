# 롯데마트 배치 4종에 랜덤 시작 지연 적용

## 구현 대상
사용자 지시(2026-10-04): "매시 7분이면 이것도 기계적인건 아닌건가 모르겠네..
일단은 넘어가고" 이후 "배치 시작시 자체적으로 랜덤 지연을 주는 방법 적용해"
— GitHub Actions cron 트리거 자체는 고정 시각이라 트리거만 보면 여전히
규칙적이지만, 배치가 실제로 롯데마트에 첫 요청을 보내는 시각을 스스로 더
흔들어서 트래픽 패턴의 규칙성을 낮춘다.

## 변경 사항
- `scripts/ingest/lib/random-startup-delay.mjs`(신규): `randomStartupDelayMs
  (maxMs)` / `applyRandomStartupDelay(maxMs, { log })` 공용 헬퍼.
- 4개 롯데마트 배치의 entry-point(CLI 실행 블록)에 배치 주기에 맞는 최대
  지연을 적용:
  - `lottemart-culture-club.mjs`(일 1회): 최대 10분
  - `lottemart-culture-club-detail.mjs`(일 1회): 최대 10분
  - `lottemart-culture-club-ping.mjs`(매시간): 최대 5분
  - `lottemart-culture-club-status-watch.mjs`(5분마다): 최대 30초(주기
    자체가 짧아 너무 늘리면 "5분마다"라는 약속이 무너지거나 다음 실행과
    겹칠 수 있어 작게만 흔듦)
- `run()` 내부가 아니라 entry-point 블록에서만 지연을 건다 — 테스트나 다른
  스크립트가 `run()`을 직접 import해 호출할 때는 지연 없이 바로 실행된다.
- `scripts/ingest/lib/random-startup-delay.test.mjs`(신규): 5개 테스트
  (범위 검증, 0/NaN 처리, 실제 대기 동작, 로그 생략 조건).

## 검증
- `npx tsc --noEmit` / `npm run test`(270개 파일 2,806개, 신규 5개 포함) /
  `npm run build` 전부 통과.
- 실제로 `applyRandomStartupDelay(2000)`를 호출해 보고된 지연 시간과 실제
  경과 시간이 일치함을 확인(1,001ms 보고 / 1,006ms 실측).

## 특이 사항
- 이마트 쪽 배치들은 이번 지시 범위(롯데마트)에 포함되지 않아 그대로 뒀다 —
  동일한 "매일/매시 고정 시각" 패턴을 똑같이 갖고 있으므로, 필요하면 같은
  헬퍼를 그대로 재사용해 적용할 수 있다.
