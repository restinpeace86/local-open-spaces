# 관리자 화면 "수정/적재일"이 카테고리 재분류 후에도 안 바뀌는 문제 수정

## 구현 대상
사용자 지시: "그리고 관리자화면의 open_spaces쪽 데이터 수정/적재일.. 내가
오늘 중분류 옮긴게 있는데 옮겨도 수정적재일이 전혀 바뀌지 않는거 같네
오늘일자로 바껴야하는거 아니야?"

## 구현 일시
2026-09-07

## 원인 (실측)
`open_spaces` 테이블에는 `updated_at`을 자동으로 갱신하는 트리거가 없다
(직접 조회로 확인 — `pg_trigger`에 이 테이블 대상 트리거 자체가 없음).
그런데 관리자 화면에서 category_min(표준 중분류)/service_category_id
(노출 중분류)를 수정하는 API 라우트 두 곳 모두 `updated_at`을 명시적으로
채우지 않고 있었다:
- `src/app/api/admin/data-grid/category-min/route.ts`(단일/일괄 수정 둘 다)
- `src/app/api/admin/open-spaces/bulk-category-mapping/route.ts`(단일/일괄
  둘 다)

그래서 관리자가 화면에서 값을 바꿔도 DB의 `updated_at`은 예전 값(주로
배치가 마지막으로 실제 적재한 시각) 그대로 남아 있었다 — 사용자가 정확히
지적한 그대로다. 오늘 낮 동안 SQL로 직접 실행한 여러 재분류 마이그레이션
(학교/종교시설 등)도 `updated_at`을 안 건드려 같은 증상이었다.

## 변경 사항
- `category-min/route.ts`: `table === 'open_spaces'`일 때만 `updated_at:
  new Date().toISOString()`을 함께 UPDATE한다(단일 id 모드 + 신규 ids 배열
  모드 둘 다). `events` 테이블에는 애초에 `updated_at` 컬럼 자체가 없어서
  (실측 확인, information_schema) 그쪽은 그대로 둔다 — `table`이
  `'open_spaces' | 'events'` 유니온이라 `.update()`가 두 테이블 스키마의
  교집합만 받아들이는(즉 `updated_at`이 아예 거부되는) TypeScript 제약이
  있어, table별로 분기해 각 테이블의 실제 컬럼으로 타입을 좁혔다.
- `bulk-category-mapping/route.ts`: 이 라우트는 `open_spaces` 전용이라
  단일/일괄 두 UPDATE 모두 그냥 `updated_at`을 추가했다.
- `scripts/migrations/2026-09-07-backfill-updated-at-todays-reclassification.sql`
  (적용 완료): 오늘(2026-09-07) 실행한 관리자 재분류 작업의 `updated_at`을
  소급 반영했다. '학교'/'종교시설'은 오늘 이전에는 이 값 자체가 전혀
  존재하지 않았던 신규 표준 중분류라(각각
  [[2026-09-07-outdoor-playground-reclassify-by-instl-place]],
  [[2026-09-07-religious-facility-category]]로 오늘 처음 생성),
  `category_min IN ('학교', '종교시설') AND category_min_source = 'MANUAL'`
  조건 하나로 오늘 재분류한 행만 정확히 특정할 수 있었다.

## 검증
- 백필 후 재확인: `종교시설` 99건 전부 `updated_at`이 오늘 시각으로
  갱신됨. `학교`는 649건 중 642건(내가 오늘 instlPlaceCd 기준으로 직접
  재분류한 건수와 정확히 일치)만 오늘 시각으로 갱신되고, 나머지 7건은
  `category_min_source`가 `RULE`(오늘 배치의 키워드 자동 분류로 신규
  적재된 행)이라 이번 백필 대상이 아니다 — 사용자가 지목한 "내가 옮긴"
  범위(관리자 수동 재분류)와 정확히 일치하는 결과다.
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1287개 테스트) /
  `npm run build` 전체 통과.

## 특이 사항
- 배치 파이프라인(RULE 기반 자동 분류, `category-rules.mjs` 등)도 동일하게
  `updated_at`을 안 건드리는 것을 발견했지만, 이번 요청은 관리자 화면의
  수동 수정에 한정된 것이라 배치 코드는 건드리지 않았다(제3장 제5조 —
  요청 범위를 넘어서는 변경을 임의로 하지 않음).
