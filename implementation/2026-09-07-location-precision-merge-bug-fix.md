# GG_CULTURE_EVENTS 반복 upsert 실패 — location/location_precision 쌍 정합성 병합 버그 수정

## 구현 대상
`docs/pipeline-log.md`에서 반복 재현된 실패: "events upsert 실패: new row for
relation "events" violates check constraint
"events_location_precision_consistency_check""
(2026-09-06 04:49/05:19, 2026-09-07 18:32 — 오늘 배치 재실행 중에도 재현).

## 구현 일시
2026-09-07

## 원인 (코드 분석으로 확정, 추측 아님)
`open_spaces`/`events` 두 테이블 모두 다음 CHECK 제약이 있다
(2026-08-23/2026-08-25 마이그레이션):
```
(location_precision = 'UNKNOWN' AND location IS NULL)
OR (location_precision != 'UNKNOWN' AND location IS NOT NULL)
```
즉 `location`과 `location_precision`은 항상 **함께** 정합적이어야 하는 쌍이다.

그런데 `scripts/ingest/lib/supabase-admin.mjs`의 두 병합 함수
(`dedupeByExternalIdMergeNulls` — 배치 내 중복 병합, `upsertRowsSafeMerge`의
DB 기존 행 병합)는 **모든 컬럼을 서로 독립적으로** "값이 있는 쪽 채택" 방식으로
병합한다. 이 두 컬럼도 예외 없이 독립적으로 처리되고 있었다:

- 기존(DB) 행: `location_precision='UNKNOWN'`, `location=NULL`(그 자체로는 정합적).
- 신규(incoming) 행: `location_precision='CITY_APPROX'`, `location=<유효 좌표>`
  (역시 그 자체로는 정합적 — 예: GG 행사 원본에 이번엔 지오코딩 가능한 장소명이
  포함된 경우).
- 병합 결과: `location_precision` 컬럼은 "값 있음(문자열 'UNKNOWN')"인 **기존** 값을
  채택하면서, `location` 컬럼은 "값 없음(NULL)"인 기존 대신 **incoming**의 유효
  좌표를 채택 — 두 컬럼이 서로 다른 소스에서 왔다.
- 결과: `location_precision='UNKNOWN'` + `location=<유효 좌표>`라는, 제약을
  위반하는 조합이 만들어져 upsert 자체가 통째로 거부됐다.

## 변경 사항
`scripts/ingest/lib/supabase-admin.mjs`:
- `LOCATION_PRECISION_RANK`(`EXACT` > `CITY_APPROX` > `UNKNOWN`)와
  `pickBetterLocationPair(a, b)` 추가 — 두 후보 중 정밀도가 더 나은 쪽의
  `{ location, location_precision }` 쌍을 **통째로** 채택한다(같으면 안정적으로
  기존/첫 번째 유지).
- `dedupeByExternalIdMergeNulls`(배치 내 중복 병합)와 `upsertRowsSafeMerge`의
  DB 기존 행 병합 두 곳 모두, 일반 컬럼별 병합 이후 이 두 컬럼만 별도로
  `pickBetterLocationPair`로 덮어써 항상 같은 출처에서 함께 오도록 보장한다.
- 정밀도가 더 나은 쪽을 채택하므로(단순히 "기존 유지"나 "신규 우선"이 아님)
  재수집으로 더 정확한 위치 정보를 얻었을 때는 반영되고, 반대로 이번 수집에서
  위치 정보를 못 얻었을 때는 기존의 더 나은 정보가 보존된다 — 어느 방향이든
  퇴행(regression)이 없다.

## 검증
- `scripts/ingest/lib/supabase-admin.test.mjs`에 3건 추가:
  1. 기존 UNKNOWN(location=null) + incoming이 더 나은 정밀도 → incoming 쌍 채택.
  2. 기존이 이미 더 나은 정밀도(EXACT) + incoming이 UNKNOWN → 기존 쌍 유지.
  3. 배치 내 동일 external_id 중복(UNKNOWN vs CITY_APPROX)도 항상 같은 쪽에서
     쌍으로 채택.
- `npx vitest run scripts/ingest/lib/supabase-admin.test.mjs`: 24개 테스트
  전체 통과(기존 21 + 신규 3).
- `npx tsc --noEmit` / `npm run test`(전체 스위트) / `npm run build` 통과.

## 실사용 재검증 (단위 테스트를 넘어선 실측)
코드 수정 후 `node scripts/ingest/run-daily.mjs --only=GG_CULTURE_EVENTS`로
GG_CULTURE_EVENTS 소스 하나만 실제 운영 DB 대상으로 재실행했다 — 오늘 배치
재실행(위 [[2026-09-07-pipeline-failsafe-and-sigungu-cache-fix]])에서는 이
소스가 수정 전 코드로 이미 실행돼 같은 오류로 여전히 실패했었는데(같은
날짜 배치 로그에 재현됨), 수정 후 단독 재실행에서는 **`[GG_CULTURE_EVENTS]
Supabase events upsert 완료: 3007건`**으로 오류 없이 정상 완료됨을 확인했다
— 단위 테스트뿐 아니라 실제 프로덕션 재현 시나리오로도 수정을 검증했다.

## 특이 사항
- 이 버그는 `dedupeByExternalIdMergeNulls`/`upsertRowsSafeMerge`를 쓰는 모든
  어댑터에 잠재적으로 영향을 줄 수 있지만(2026-09-07 발견한 base-collector-
  adapter.mjs의 "COALESCE Safe UPSERT를 모든 소스 공통 기본값으로 승격" 코멘트
  참고), 실제로 이 제약을 위반할 조건(location_precision이 UNKNOWN↔비UNKNOWN
  사이를 오갈 수 있는 소스)을 가진 것은 현재 GG_CULTURE_EVENTS(경기데이터드림,
  좌표 없는 원본을 다루는 유일한 이벤트 소스)뿐이라 실제 재현은 이 소스에서만
  났다. 다른 어댑터는 항상 `EXACT`만 쓰거나 애초에 좌표 없는 행을 드롭하므로
  이 쌍이 섞일 일이 없었다.
- 오늘 배치 재실행([[2026-09-07-pipeline-failsafe-and-sigungu-cache-fix]])
  중에 이 실패가 다시 실측 재현돼(`docs/pipeline-log.md` 2026-09-07 18:32
  항목) 이번 수정의 직접적인 계기가 됐다.
