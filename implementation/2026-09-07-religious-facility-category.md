# 어린이놀이시설(실내) — raw_data.instlPlaceCdNm='종교시설' 재분류

## 구현 대상
사용자 질문/지적: "중분류 어린이놀이시설(실내)보면 종교시설도 있고 그랬는데
종교시설에 대한 중분류는 없지 않나?"

## 구현 일시
2026-09-07

## 확인 결과
사용자 관찰이 정확했다 — `open_spaces`에 `category_min = '종교시설'`인 행이
하나도 없었다. `어린이놀이시설(실내)` 중 `raw_data.instlPlaceCdNm = '종교시설'`
인 행이 **99건** 있었다(부속 놀이시설이 종교시설 안에 있는 경우로 추정 —
[[2026-09-06-indoor-playground-reclassify-by-instl-place]]/
[[2026-09-07-outdoor-playground-reclassify-by-instl-place]]와 완전히 동일한
패턴).

## 변경 사항
`scripts/migrations/2026-09-07-add-religious-facility-category-min.sql`
(적용 완료): `category_rules`에 `('open_spaces', '종교시설', '종교시설', false)`
등록 + `category_min = '어린이놀이시설(실내)'` 이고
`raw_data->>'instlPlaceCdNm' = '종교시설'`인 행을 `category_min='종교시설'`,
`category_min_source='MANUAL'`로 변경. 안전망 폴백 목록
(`category-min-fallback.ts`)에도 `'종교시설'`을 추가했다.

## 검증(실측)
적용 후 재확인: `종교시설` **99**건(정확히 일치), `어린이놀이시설(실내)`도
그만큼 감소.

## 검증
코드 변경(fallback 배열 문자열 1개 추가)만 있어 기존 패턴대로 신규 테스트는
추가하지 않았다 — `npx tsc --noEmit` / `npm run test` / `npm run build`
통과.
