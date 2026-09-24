# upsertRowsSafeMerge 배치 단위 장애 격리 (실패한 배치만 건너뛰고 계속 진행)

## 구현 대상
사용자 지시(2026-09-26): "어 300개로 나눴으면 중간에 실패나면 그 300건에
대하여서만 실패하고 다음단계 수행하도록 넘어가는게 좋을꺼 같은데... 그리고
오더링 해서 처음 300개가 1이고 두번째 301~600이 2이고 하면 어디에서
실패했는지 파악 가능하잖아" — "8초 타임아웃에 걸리는 빈도가 줄었는지
확인해줘"라는 후속 검증 요청에 답하기 전에, 애초에 한 배치가 완전히
실패했을 때 나머지가 어떻게 되는지 점검하다 나온 지시.

## 발견한 기존 동작(수정 전)
`upsertRowsSafeMerge()`(`scripts/ingest/lib/supabase-admin.mjs`)의 배치
루프에는 배치별 try/catch가 없었다. 한 배치의 `withRetry`가 재시도(초기
1회+재시도 3회)까지 전부 실패하면 그 예외가 루프 밖으로 그대로 던져져,
`base-collector-adapter.mjs`의 `catch (err) { throw err; }`를 거쳐
`run-monthly.mjs`의 STEPS 루프까지 올라가 **그 소스 전체가 그 실행
회차에서 실패 처리**됐다 — 300건씩 나눠도 200번째 배치가 완전히 실패하면
나머지 167개 배치(약 5만 건)가 그 실행에서 아예 시도조차 되지 않았다.

## 변경 사항
### 1. `scripts/ingest/lib/supabase-admin.mjs`
`upsertRowsSafeMerge()`의 배치 루프 전체를 try/catch로 감쌌다:
- 1-기준 배치 번호(`batchNumber`)와 원본 행 범위(`range`, 예: "301~600")를
  계산해, 어느 배치가 실패했는지 바로 알 수 있게 한다.
- 배치가 완전히 실패하면(조회든 upsert든) 콘솔에 에러를 남기고
  `failedBatches` 배열에 `{batchNumber, range, count, error}`를 push한 뒤
  **다음 배치로 계속 진행**한다 — 더 이상 예외를 던지지 않는다.
- 실패한 배치의 병합 건수(`mergedWithExisting`)가 전체 합계를 오염시키지
  않도록, 배치 로컬 변수에 모았다가 upsert가 실제로 성공한 뒤에만 전체
  합계에 더하는 구조로 바꿨다.
- 반환값에 `failedBatches`(빈 배열이면 전부 성공)를 추가했다.

### 2. `scripts/ingest/adapters/base-collector-adapter.mjs`
- 신규 헬퍼 `describeFailedBatches()`로 `failedBatches`를 사람이 읽을 한
  줄로 요약(단일 테이블 경로와 다중 테이블 경로가 공유).
- 단일 테이블 `run()`: `failedBatches`가 있으면 `runMultiTableUpsert()`의
  기존 "테이블별 부분 실패" 패턴과 동일하게 `note`/`hasPartialFailure:true`
  로 담아 반환한다(제5장 제11조 무중단 원칙 — 실패 사실은 숨기지 않되,
  성공한 나머지 건수는 그대로 보고한다).
- `runMultiTableUpsert()`: 테이블 자체는 예외 없이 정상 반환됐어도 그 안의
  일부 배치만 실패했을 수 있어(`perTableResult[table].failedBatches`),
  기존 "테이블 통째 실패"(`tableFailures`) 노트에 "테이블 내 배치 부분
  실패" 노트를 추가로 합쳐 `hasPartialFailure`/`note`에 반영하도록
  확장했다.

## 검증
- `scripts/ingest/lib/supabase-admin.test.mjs`: 기존 "조회/upsert 에러 시
  던진다" 테스트 2개를 "던지지 않고 failedBatches에 기록한 채 계속
  진행한다"로 재작성. 신규: 900건(3배치)에서 가운데 배치(301~600)만
  실패해도 앞뒤 배치는 정상 upsert되고 실패 배치의 번호/범위가 정확히
  기록되는지 검증하는 테스트 추가.
- `scripts/ingest/adapters/base-collector-adapter.test.mjs`: 단일 테이블
  경로에서 `failedBatches`가 `note`/`hasPartialFailure`로 옮겨지는지,
  다중 테이블 경로에서 테이블 내 배치 부분 실패도 동일하게 반영되는지
  각각 신규 테스트 추가.
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,332개) / `npm run build`
  모두 통과.
- 실측: `run-monthly.mjs --only=LOCALDATA_PLAYGROUND`(82,431건, 300건
  배치 약 275개)를 실제로 재실행해 새 격리 로직이 실전에서도 정상
  동작하는지(배치 실패가 나더라도 전체가 중단되지 않는지) 확인.

## 특이 사항
- 이 변경은 재시도(`withRetry`) 메커니즘과 별개다 — 재시도는 "같은 배치를
  다시 시도"하는 것이고, 이번 변경은 "재시도까지 다 실패한 배치를 포기하고
  다음 배치로 넘어가는 것"이다. 둘은 상호보완적으로 함께 동작한다.
- 실패한 배치는 그 실행에서는 DB에 반영되지 않는다 — 다음 정기 배치(월
  1회) 또는 수동 재실행 시 `onConflict: 'external_id'`로 다시 시도된다.
  `failedBatches`가 파이프라인 로그의 `note`에 남으므로, 특정 배치가
  반복적으로 실패하는지 사후에 확인할 수 있다.
