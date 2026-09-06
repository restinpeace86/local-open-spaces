# 어린이놀이시설(실내) — instlPlaceCdNm='유치원' 나머지 2건 재분류 (후속)

## 구현 대상
사용자 지시: "어 유치원 2건도 유치원 중분류로 보내줘" — 직전 작업
([[2026-09-06-indoor-playground-reclassify-by-instl-place]])에서 이번 요청이
없어 남겨뒀던 나머지 2건.

## 구현 일시
2026-09-06

## 변경 사항
`scripts/migrations/2026-09-06-reclassify-indoor-playground-kindergarten-instl-place.sql`
(적용 완료): `category_min='어린이놀이시설(실내)'`이고 `raw_data->>
'instlPlaceCdNm' = '유치원'`인 행을 `category_min='유치원'`,
`category_min_source='MANUAL'`로 변경.

## 검증(실측)
적용 후 재확인: `어린이놀이시설(실내)` 995 → **993**(-2, 사전 확인과 일치),
`유치원` **93**건(라이브 배치 수집으로 인한 소폭 변동 범위 내 — 이 세션 내내
관찰된 정상적인 드리프트).

## 검증
코드 변경 없음(순수 DB 변경) — 직전 커밋에서 이미 tsc/test/build 통과 상태를
유지한다.
