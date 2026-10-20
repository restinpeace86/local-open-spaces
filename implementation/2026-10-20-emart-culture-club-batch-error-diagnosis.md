# 이마트 컬처클럽 배치 반복 에러 원인 확인 및 수정

## 구현 대상
`todo.md` 개선사항 1: "이마트 컬쳐클럽 배치 수집 계속 에러나고 있는데
원인확인해줘. 원인 확인 및 조치 방법까지 알려줘"

## 구현 일시
2026-10-20

## 진단
`C:\Users\momob\local-open-spaces-emart-batch.log`(로컬 작업 스케줄러
`LocalOpenSpaces-EmartBatch-AM/PM`, `schtasks /query` 확인상 둘 다 마지막
실행 결과=1, 즉 실패) 실측 확인 결과 **서로 다른 두 원인**이 연속으로
발생하고 있었다.

### 원인 1 — 소수 문자열이 integer 컬럼에 들어가 upsert 실패(과거 2회)
```
❌ 이마트 컬처클럽 수집 실패: emart_culture_club_classes upsert 실패:
invalid input syntax for type integer: "46.2"
```
`scripts/ingest/emart-culture-club.mjs`의 `toIntOrNull()`이 문자열→숫자
변환까지만 하고 반올림을 하지 않았다. 이마트 API가 `classFee` 등 숫자
필드를 가끔 소수 문자열로 내려주면(기존에도 `minClassCapacity`가 문자열
"1"로 오는 타입 불일치가 실측돼 있었음, 이번은 그 변형) 그대로 integer
컬럼에 들어가다 postgres가 거부했다.

### 원인 2 — 이마트 Elasticsearch 백엔드의 일시적 Bad Request(최근 2회, 현재진행)
```
❌ 이마트 컬처클럽 수집 실패: 이마트 컬처클럽 GraphQL 에러:
[{"path":["getClassByFiltering"],...,"errorType":"Elasticsearch:UserIllegalArgumentException",
"message":"Elasticsearch responded with an error: Bad Request"}]
```
동일한 쿼리(지점 78개+카테고리 5개+classStatus='접수대기')를 직접
재호출해 실측한 결과, **몇 분 뒤 재시도하면 그냥 성공**했다 — 요청
자체가 잘못된 게 아니라 이마트 쪽 Elasticsearch가 일시적으로 Bad
Request를 내는 현상이다(정확한 내부 원인은 알 수 없음 — 추측 금지).
기존 `isRetryableError`(타임아웃/네트워크 계열 패턴)엔 이 메시지가
안 걸려 재시도 없이 즉시 배치 전체가 실패하고 있었다.

## 변경 사항
`scripts/ingest/emart-culture-club.mjs`:
1. `toIntOrNull()`: `Number(value)`를 `Math.round(n)`으로 감싸 소수
   문자열도 정수로 반올림(원래 주석의 의도 "그 외엔 숫자로 변환한다"를
   소수 케이스까지 포함하도록 보강).
2. `fetchAllForStatus()`의 `fetchPage()` 호출을 기존 재시도 유틸
   `withRetry()`(`scripts/ingest/lib/retry.mjs`, 이미 다른 수집 어댑터들이
   쓰는 패턴)로 감싸고, `isEmartTransientError()`(신규, export)로
   기존 `isRetryableError` 패턴에 `Elasticsearch`/
   `UserIllegalArgumentException` 메시지도 재시도 대상으로 추가.

`scripts/ingest/emart-culture-club.test.mjs`: 신규 테스트 4개
(소수 문자열 반올림 1개, `isEmartTransientError` 3개 — Elasticsearch
메시지/기존 타임아웃 패턴/영구적 오류 구분).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(333 파일 3,332개, 신규 4개
  포함) / `npm run build` 전부 통과.
- 실측으로 직접 이마트 GraphQL API를 재호출해 원인 2가 일시적임을
  확인(동일 쿼리가 몇 초~몇 분 뒤 재시도 시 성공).

## 특이 사항
- 다음 번 로컬 스케줄러 실행(`LocalOpenSpaces-EmartBatch-AM/PM`, 매일
  09:00)부터 이 수정이 적용된다 — 재시도로도 끝까지 실패하면(이마트
  쪽이 장시간 다운된 경우) 배치는 여전히 실패로 끝나고 디스코드 알림이
  간다(기존 동작 유지, 영구 실패를 숨기지 않음).
- 이번 조치는 어느 쪽도 "새 기능"이 아니라 기존 코드의 버그 수정(정수
  반올림 누락, 재시도 패턴 범위 부족)이라 별도 Decision 기록 없이
  진행했다.
