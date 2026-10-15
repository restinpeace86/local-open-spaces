# 서울시 시영주차장 실시간 주차대수 연동 (todo.md 개선사항2)

## 구현 대상
`implementation/todo.md` 개선사항2 — `GetParkingInfo`(data.seoul.go.kr)로
서울시 시영주차장의 실시간 주차 가능 면수를 `parking_metadata.realtime_
available_count`에 반영. 핵심 설계(매칭 방식, 수집 주기)는
`project/decision-log.md` Decision 034 참고.

## 구현 일시
2026-10-15

## 변경 사항
### `scripts/ingest/parking-realtime-seoul.mjs` + 테스트(8개, 신규)
- `GetParkingInfo` 호출(페이징, 실측 총 122건) → 노상 주차장(66건) 제외 →
  노외 56건만 대상.
- 가능 면수 = `TPKCT(총면수) - NOW_PRK_VHCL_CNT(현재 주차 차량 수)`로 직접
  계산(필드명이 "가능 면수"가 아니라 "현재 주차 차량 수"임을 실측으로
  확인하고 반영).
- 좌표가 없는 API라 PostGIS 매칭 불가 — `match-parking-to-spots.mjs`의
  `nameSimilarity`를 재사용해 **같은 "구" + 이름 유사도 0.5 이상** 조건으로
  매칭(구 조건 없이는 흔한 이름이 오매칭될 위험 — Decision 033/034 참고).
- `parking_metadata.realtime_available_count`/`realtime_updated_at` 갱신.
- `pipeline-agent-registry.mjs`에 `PARKING_REALTIME_SEOUL` 등록,
  `package.json`에 `ingest:parking-realtime-seoul` 스크립트 추가.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(318개 파일 3,215개 테스트) /
  `npm run build` 전부 통과.
- **실제 실행**: 122건 수신 → 노외 56건 → 55건 매칭/갱신(매칭 실패 1건).
- **단위 테스트로 실제 버그 발견/수정**: `Number('')`가 `NaN`이 아니라
  `0`이라 `Number.isFinite()` 검사를 그냥 통과해버리는 함정을 테스트 작성
  중 직접 발견 — 빈 문자열을 명시적으로 먼저 걸러내도록 수정.
- **라이브 REST 재확인**: anon 키로 `get_nearby_parking_lots` RPC를 직접
  호출해 `realtime_available_count`가 실제로 채워진 값(예: 789)으로
  반환되는 것까지 확인.

## 특이 사항 / 남은 작업
- **로컬 PC 작업 스케줄러 등록은 사용자가 직접 수행해야 함** — 이 세션은
  `schtasks /create`를 직접 실행하는 게 막혀 있다(Decision 031/032와 동일한
  제약). 아래 명령을 관리자 권한 cmd.exe(중첩 따옴표 문제 없이 동작,
  2026-10-13 유아숲체험원 작업 때 확인된 `.bat` 래퍼 방식 그대로 재사용)에서
  실행:
  1. `scripts/scheduled-tasks/run-parking-realtime-seoul.bat` 파일을 아래
     내용으로 만든다(이 커밋에 이미 포함돼 있음):
     ```bat
     @echo off
     set IS_SCHEDULED_RUN=true
     cd /d D:\workspace\local-open-spaces
     node scripts\ingest\parking-realtime-seoul.mjs >> C:\Users\momob\local-open-spaces-parking-realtime-seoul.log 2>&1
     ```
  2. 10분 주기로 등록(Windows 작업 스케줄러는 `/sc MINUTE /mo 10` 지원):
     ```
     schtasks /create /tn "LocalOpenSpaces-ParkingRealtimeSeoul" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-parking-realtime-seoul.bat" /sc MINUTE /mo 10 /f
     ```
- 매칭 실패 1건(56개 중)은 이름 유사도 임계값을 못 넘었거나 parking_metadata
  쪽에 같은 구 소재 대응 레코드가 없는 경우로 추정(개별 조사는 이번 범위에
  포함하지 않음 — 1건뿐이라 영향 적음).
