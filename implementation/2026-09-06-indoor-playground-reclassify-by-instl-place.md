# 어린이놀이시설(실내) — raw_data.instlPlaceCdNm 기준 재분류

## 구현 대상
사용자 지시: "중분류 -어린이놀이시설(실내)에서 raw_data에 대하여 하기 5건은
중분류 기타로 옮겨주고 instlPlaceCdNm: 학교/주택단지/목욕장업소/학원, 하기
1건은 중분류 어린이집으로 옮겨줘 instlPlaceCdNm: 어린이집"

## 구현 일시
2026-09-06

## 배경
`instlPlaceCdNm`(설치장소코드명)은 정부 원천 데이터의 실제 설치 장소
분류다. 이름(name)에 "어린이집"/"유치원"이 없어 지난 재분류
([[2026-09-06-daycare-kindergarten-category]], name LIKE 기준)에서는
걸러지지 않았지만, `instlPlaceCdNm`을 보면 실제로는 학교/주택단지/
목욕장업소/학원 부속 놀이시설(키즈/놀이시설로 분류하기 부적절 → '기타')
이거나, 설치 장소 자체가 어린이집인 경우가 있었다.

## 변경 사항
`scripts/migrations/2026-09-06-reclassify-indoor-playground-by-instl-place.sql`
(적용 완료):
- `category_min='어린이놀이시설(실내)'` 대상 `raw_data->>'instlPlaceCdNm'`이
  `학교`/`주택단지`/`목욕장업소`/`학원`인 행 → `category_min='기타'`.
- `raw_data->>'instlPlaceCdNm'`이 `어린이집`인 행 → `category_min='어린이집'`.
- 두 기준 모두 이름 키워드가 아닌 raw_data 필드값 기준의 관리자 명시적 판단이라
  `category_min_source='MANUAL'`로 표시했다.
- '기타'/'어린이집' 둘 다 이미 존재하는 표준 중분류라 category_rules에 별도
  등록은 하지 않았다 — `get_category_min_options`는 2026-08-27 수정 이후
  category_rules가 아니라 실제 `open_spaces.category_min` 컬럼에서 직접
  distinct를 뽑는다(`2026-08-27-fix-category-min-options-source.sql`, "화면보다
  데이터 우선" 원칙). **바로잡음**: 지난 두 건([[2026-09-06-daycare-kindergarten-
  category]], [[2026-09-06-restaurant-category-min]]) 문서에서 "category_rules
  등록이 표준 중분류 목록에 나타나게 하는 원인"이라고 적었던 것은 부정확했다 —
  실제로는 category_min 컬럼 UPDATE 자체가 원인이었고, category_rules 등록은
  향후 신규 수집 데이터의 이름 키워드 기반 자동 분류("[규칙 기반 일괄 재분류
  실행]" 버튼) 목적으로만 유효하다. 결과 자체(목록에 정상 노출)는 맞았으나
  인과 설명이 잘못됐던 것으로, 이번 기록에서 정정한다.

## 검증(실측)
- 사전 확인: `어린이놀이시설(실내)` 대상 `instlPlaceCdNm`별 건수 — 학교 48,
  주택단지 285, 목욕장업소 29, 학원 23(합계 385) / 어린이집 5.
- 적용 후 재확인: `어린이놀이시설(실내)` 1,385 → **995**(-390, 385+5와 일치),
  `기타` +385, `어린이집` 203 → **208**(+5) — 모두 사전 확인과 정확히 일치.
- 재확인 쿼리로 남은 `어린이놀이시설(실내)`의 `instlPlaceCdNm` 분포에서
  학교/주택단지/목욕장업소/학원/어린이집이 전부 사라졌음을 확인(다른 값
  — 식품접객업소/종교시설/아동복지시설/대규모점포/주상복합/의료기관/
  유치원(2건)/도로휴게시설 — 은 이번 요청 범위 밖이라 그대로 유지).

## 검증
코드 변경 없음(순수 DB 재분류) — `npx tsc --noEmit` / `npm run test` /
`npm run build`는 직전 커밋에서 이미 통과 상태를 유지한다(이 작업 자체는
SQL만 변경).

## 특이 사항
- 남아 있는 `instlPlaceCdNm='유치원'`인 2건은 사용자가 이번에 명시하지
  않아 손대지 않았다(제3장 제5조 추측 금지) — 필요하면 별도로 요청받아
  처리한다.
