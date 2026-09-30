# 표준중분류 '전시실'/'미술관' 명칭·주소 CSV 내보내기

## 구현 대상
사용자 지시(2026-09-30): "표준중분류가 '전시실'인것과 '미술관' 도 각각
csv파일로 DB데이터 추출해서 생성해줘"

## 실측 확인
`export-etc-and-unassigned-category-min.mjs`와 동일한 관례(명칭+주소만,
중복 대표 행만, 1,000건 페이지네이션)를 그대로 재사용해 두 표준중분류를
각각 별도 CSV로 추출했다.
- category_min='전시실' 대표 행: **500건** → `전시실.csv`
- category_min='미술관' 대표 행: **548건** → `미술관.csv`

## 변경 사항
### `scripts/export-exhibition-and-art-museum-name-address.mjs` (신규, 실행 완료)
`fetchAllRows`/`writeCsv` 헬퍼(기존 export 스크립트와 동일 패턴)로
category_min='전시실'/'미술관' 대표 행을 각각 조회해 `전시실.csv`/
`미술관.csv`로 저장한다.

### `scripts/export-exhibition-and-art-museum-name-address.test.mjs` (신규, 3개 테스트)
기존 `export-etc-and-unassigned-category-min.test.mjs`와 동일한 구조로
(1) 두 파일이 각각 저장되는지, (2) display_name 우선순위, (3) 1,000건 초과
시 페이지네이션 전량 조회를 검증한다.

## 검증
- `npx vitest run scripts/export-exhibition-and-art-museum-name-address.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 235개 파일 2,569개) / `npm run build` 모두 통과.
- 실제 실행: 전시실 500건 / 미술관 548건 저장 확인.

## 특이 사항
생성된 `전시실.csv`/`미술관.csv`는 이번 세션의 기존 관례(export 결과물은
커밋하지 않음)에 따라 커밋하지 않았다 — 생성 스크립트와 테스트만 커밋한다.
