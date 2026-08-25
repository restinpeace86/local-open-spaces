# 배치 자동화 및 로깅 체계 확정: 코드 분석 기반 Daily/Weekly 배치 분리 및 pipeline-log.md 자동 로깅

## 구현 대상
- 사용자 지시([배치 자동화 및 로깅 체계 확정], 2026-08-25): 실제 어댑터 코드를 정밀 분석해
  적재 대상 테이블(events vs open_spaces)에 따라 수집 배치를 Daily/Weekly로 분리하고, 매
  배치 실행 결과를 `docs/pipeline-log.md`에 자동으로 누적 기록
- 코드 분석 기반 분류 리포트(events 전용/open_spaces 전용/복합 API)
- Daily/Weekly 배치 실행 스크립트 + GitHub Actions 분리 구성
- 배치 실행마다 pipeline-log.md 자동 기록 여부를 실제 실행으로 테스트/증빙

## 구현 일시
2026-08-26 (작업 시작은 2026-08-25 야간)

## 1. 코드 분석 기반 분류 리포트

각 어댑터 파일의 `super({ targetTable: ... })` 호출 또는 `upsertRowsSafeMerge(..., '테이블명', ...)`
호출 대상을 grep으로 직접 확인했다(추측 없음).

| 분류 | 소스(sourceKey) | 실제 파일 | 근거 |
| :--- | :--- | :--- | :--- |
| **events 전용** | GG_CULTURE_EVENTS | gg-culture-events-adapter.mjs | `targetTable: 'events'` |
| **events 전용** | SEOUL_CULTURE_EVENTS | seoul-culture-events.mjs | `upsertRowsSafeMerge(..., 'events', ...)` |
| **events 전용** | TOUR_API_FESTIVAL | tour-api-festival.mjs | `upsertRowsSafeMerge(..., 'events', ...)` |
| **복합(양쪽)** | SEOUL_YEYAK | seoul-yeyak-adapter.mjs | `targetTable: 'multi'`(체육/공간시설→open_spaces, 문화체험/교육강좌→events) |
| **open_spaces 전용** | CITY_PARK | city-park-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | CULTURE_FACILITY | cultural-spaces.mjs | `upsertRowsSafeMerge(..., 'open_spaces', ...)` |
| **open_spaces 전용** | CULTURAL_FACILITY_SUMMARY | cultural-facility-summary-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | LOCALDATA_AMUSEMENT | amusement-park-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | GG_EVENTS | gg-events-adapter.mjs | `targetTable: 'open_spaces'`(이름과 달리 공공수영장/물놀이시설 — events 아님) |
| **open_spaces 전용** | GO_CAMPING | go-camping-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | NATIONAL_PARK_ECOTOUR | national-park-ecotour-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | LOCALDATA_PLAYGROUND | playground-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | PUBLIC_FACILITY_OPEN | public-facility-open-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | SWIMMING_POOL | swimming-pool-adapter.mjs | `targetTable: 'open_spaces'` |
| **open_spaces 전용** | KOR_TOUR_API_V4 ×3 | kor-tour/kor-with-tour/kor-pet-tour-adapter.mjs | 공유 베이스 `tour-api-v4-area-based-adapter.mjs`가 `targetTable: 'open_spaces'` |

합계: events 전용 3 + 복합 1 + open_spaces 전용 13(공유 베이스 3개 포함) = 17개 Source.

## 2. Daily/Weekly 배치 구성

- **Daily Events Batch**(`scripts/ingest/run-daily.mjs`): events 전용 3개 + 복합 1개(SeoulYeyak,
  사용자 지시대로 행사/접수 상태 갱신을 위해 Daily 포함) + 후처리 1개
  (`enrich-gg-culture-event-locations` — gg-culture-events가 남긴 CITY_APPROX/UNKNOWN 좌표를
  EXACT로 승격, gg-culture-events 직후 실행) = 5단계.
- **Weekly Spaces Batch**(`scripts/ingest/run-weekly.mjs`): open_spaces 전용 13개 전부 = 13단계.
- 각 단계는 순차 실행한다([전체 파이프라인 일괄 가동] 작업에서 동시 실행 시 API 레이트리밋/
  DB 커넥션 과부하를 겪은 교훈을 그대로 따름).
- 기존 워크플로 3개(`ingest-daily.yml`/`ingest-monthly.yml`/`ingest-tourapi-daily.yml`)를
  `ingest-daily.yml`(단일 스텝, run-daily.mjs 호출) + `ingest-weekly.yml`(신규, 단일 스텝,
  run-weekly.mjs 호출) 2개로 재구성했다. `ingest-monthly.yml`/`ingest-tourapi-daily.yml`은
  삭제(완전히 대체됨) — 두 워크플로 모두 open_spaces 전용 API만 다뤘는데 스케줄 주기(월
  1회 vs 매일)만 서로 달랐던 것을 이번 지시대로 "주간"으로 통일했다. `run-all.mjs`(스테일,
  17개 중 5개만 다루고 있었음)도 완전히 대체돼 삭제했다.
- KorTour/KorWithTour/KorPetTour/GoCamping 4종은 기존에 "증분 수집 파라미터 미지원 →
  매일 전량 재수집" 정책으로 Daily 스케줄에 있었으나(implementation/todo.md Task 2), 이번
  지시는 "events면 Daily, open_spaces 전용이면 Weekly"를 유일한 분류 기준으로 못박아 이
  4종도 예외 없이 Weekly로 재분류했다. "매회 전량 재수집" 정책 자체(코드)는 그대로 두고
  스케줄 주기만 이동했다.

## 3. docs/pipeline-log.md 자동 로깅

- `scripts/ingest/lib/batch-log.mjs`(신규): 사용자 지정 포맷대로
  `## [YYYY-MM-DD HH:mm:ss] [배치명] Ingestion Log` 헤더 + 소스별 표(`RAW 수신 건수`/
  `events 적재 건수`/`open_spaces 적재 건수`/`Safe Merge 건수`/`에러 건수`/`비고`) +
  "전체 RAW 수신 vs DB 적재(+에러+범위제외)" 드롭 검증 문구를 문서 맨 아래에 Append한다.
  기존 `recordPipelineRun()`(소스 1개 실행 1행 표)은 그대로 유지 — 대체가 아니라 배치 단위
  요약을 추가로 남기는 것이다.
- `BaseCollectorAdapter.run()`/`runMultiTableUpsert()`의 반환값에 `source`/`rawCount`/
  `rawArchivedCount`/`safeMergeCount`/`errorCount`를 추가해(기존 `count`/`upserted`/
  `perTable` 등은 그대로 유지 — 애디티브 변경) 배치 오케스트레이터가 각 어댑터를 실행한
  결과를 그대로 리포트 행으로 쓸 수 있게 했다.
- `BaseCollectorAdapter`에 `source`(DB `source` 컬럼 값) 생성자 파라미터를 추가하고, 12개
  어댑터 + 공유 베이스 1개의 `super()` 호출에 각자의 `SOURCE` 상수를 연결했다 — 배치
  리포트의 "API 출처 식별자" 컬럼이 `sourceKey`(예: `SEOUL_YEYAK`)가 아니라 실제 `source`
  컬럼 값(예: `seoul_public_reservation`)을 쓸 수 있도록.
- BaseCollectorAdapter를 쓰지 않는 3개 레거시 스크립트(cultural-spaces/seoul-culture-events/
  tour-api-festival)를 `main()` 단발 실행에서 `export async function run({dryRun})` 재사용
  가능한 함수로 리팩터링(CLI 진입점은 `pathToFileURL(process.argv[1]).href === import.meta.url`
  가드로 유지 — Windows에서 `process.argv[1]`이 백슬래시 경로라 문자열로 직접 비교하면 항상
  false가 되는 것을 실측으로 확인해 이 방식으로 정정).

## 검증 결과

### 코드 검증
- `npx tsc --noEmit` / `npm run test`(37파일 394건) / `npm run build`: 모두 통과.
- `scripts/ingest/lib/batch-log.test.mjs`(신규, 7건): 배치 헤더/표 포맷, 드롭 0건/드롭 발견
  검증 문구, 실행 실패 소스 표시, multi 테이블 분리, 후처리 단계 제외 로직 모두 검증.
- `base-collector-adapter.test.mjs`에 2건 추가(16건): 성공 시 반환값에 필요한 필드가 담기는지,
  그리고 아래 "실측 중 발견한 버그" 재발 방지 테스트.

### 실제 배치 실행으로 pipeline-log.md 자동 기록 증빙 (사용자 지시 3항)
- **Daily Events Batch 실제 실행 2회**(`node scripts/ingest/run-daily.mjs`, 첫 실행에서 버그
  발견 후 수정하고 재실행): 5/5단계 성공, `docs/pipeline-log.md`에
  `## [2026-08-25 23:58:12] [Daily Events Batch] Ingestion Log` 블록이 정상 Append됨을
  확인. 최종 검증 문구: "전체 RAW 수신 25918건 vs DB 적재 25048건 (+에러 841건 +범위제외
  29건) → **드롭 0건 확인 ✅**".
- **Weekly Spaces Batch 실제 실행**(`node scripts/ingest/run-weekly.mjs`): 13/13단계 성공,
  `## [2026-08-26 00:25:46] [Weekly Spaces Batch] Ingestion Log` 블록이 정상 Append됨을 확인.
  최종 검증 문구: "전체 RAW 수신 155253건 vs DB 적재 144013건 (+에러 11240건 +범위제외
  0건) → **드롭 0건 확인 ✅**".

### 실측 중 발견해 그 자리에서 수정한 버그 1건
- **`runMultiTableUpsert()`의 errorCount가 "적재는 됐지만 이상 신호만 남긴" 항목까지
  드롭으로 잘못 집계**: SeoulYeyakAdapter의 `COORDINATE_PARSE_FAIL`은 좌표 파싱에 실패해도
  행을 드롭하지 않고 `location_precision='UNKNOWN'`으로 정상 적재한다([전체 파이프라인
  일괄 가동] 작업에서 이미 이렇게 설계됨). 그런데 배치 리포트용 `errorCount`를
  `errorCounts` 전체 합산으로 계산했더니, 실제 Daily 배치 첫 실행에서 SEOUL_YEYAK 행이
  "RAW 2931건 vs (적재 2902 + 에러 15 + 제외 29) = 2946건"으로 수신 건수보다 15건 더 많은
  모순이 발생해 "드롭 -15건 발견"이라는 말이 안 되는 결과가 나왔다(실측으로 발견). errorCount를
  "rawCount - 실제 출력 배열 길이 합 - excludedCount"(진짜로 어디에도 안 들어간 건수)로
  다시 계산하도록 고치고 재실행해 "드롭 0건 확인"으로 정상화했다. 과거 로그 행(첫 실행)은
  소급 수정하지 않고 그대로 보존했다(docs/pipeline-log.md 상단 정책 그대로 적용).

## 특이 사항
- **`enrich-gg-culture-event-locations`는 "Source"가 아니라 후처리 단계다**: 신규 RAW 수집이
  없고(이미 오늘 gg-culture-events가 수집한 events 행의 좌표 정밀도만 승격) 사용자 분류
  기준(events/open_spaces 적재 대상)에 깔끔히 맞지 않는다. 표에는 행으로 남기되(투명성),
  드롭 검증 합계에서는 제외했다(`excludeFromVerification: true`) — 안 그러면 같은 행이
  gg-culture-events 행과 이중 집계돼 검증 수치가 왜곡된다.
- **KorTour/KorWithTour/KorPetTour/GoCamping을 Daily→Weekly로 옮긴 것은 사용자의 새 분류
  기준을 그대로 따른 결과다**: 기존 "증분 수집 불가라 매일 전량 재수집" 근거 자체는 여전히
  유효하지만(코드 변경 없음), 이번 지시가 "targetTable이 유일한 분류 기준"이라고 명시적으로
  못박았으므로 임의 판단 없이 그대로 반영했다. 필요하면 갱신 주기(주 1회로 충분한지)를
  별도로 재논의할 수 있다.
- **Gemini API 레이트리밋(HTTP 429)으로 SEOUL_CULTURE_EVENTS의 상당수 항목이 ETC로
  분류됨**(실제 Daily 배치 실행 중 확인): 기존에 이미 있던 폴백 정책(ai-rule.md 4.1 "AI
  불확실 시 ETC")이 정상 동작한 것이라 코드 문제는 아니나, Gemini 무료 티어 쿼터 한도로
  보인다 — 이번 작업 범위(배치 분리/로깅) 밖이라 손대지 않았다.
- **VWorld API가 실행 중 간헐적으로 502를 반환**(Weekly 배치 cultural-facility-summary
  단계에서 다수 확인): 이 어댑터는 요청 간 pacing/재시도가 없어([전체 파이프라인 일괄
  가동] 작업에서 이미 확인한 사실) 이번에도 동일하게 관찰됐다 — 항목 단위 try-catch로
  무중단은 유지됐고(배치 실패로 이어지지 않음), pacing/재시도 보강은 이번 작업 범위 밖.
