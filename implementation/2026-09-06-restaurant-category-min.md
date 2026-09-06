# open_spaces 표준 중분류 신규 추가 — "식당" (놀이방식당 중 노출중분류 없는 것 이동)

## 구현 대상
사용자 지시: "중분류 식당 하나 더 만들어줘 그리고 놀이방식당중에 노출중분류가
없는 것에 대하여 전부 식당으로 옮겨줘"

## 구현 일시
2026-09-06

## 변경 사항

### DB — category_rules 등록 + 기존 데이터 재분류
`scripts/migrations/2026-09-06-add-restaurant-category-min.sql`(적용 완료):
- `category_rules`에 `('open_spaces', '식당', '식당', false)` 등록 — 어린이집/
  유치원과 동일한 관례로, `get_category_min_options` RPC가 이 테이블을
  Source of Truth로 삼으므로 이 등록만으로 "표준 중분류" 목록에 '식당'이
  새로 나타난다. 부수 효과로 앞으로 새로 수집되는 행도 이름에 "식당"이
  있으면 기존 "[규칙 기반 일괄 재분류 실행]" 버튼으로 자동 분류된다.
- 실측 확인: `category_min = '놀이방식당'` 총 1,828건 중 노출중분류
  (`service_category_id`)가 없는 행 1,788건 / 있는 행 40건. 노출중분류가
  있는 40건은 스팟 큐레이션 탭에서 이미 "키즈 놀이 가능 식당"으로 검수·확정된
  것들이라 그대로 '놀이방식당'에 남기고, 사용자가 지시한 범위 그대로 아직
  검수 전인 1,788건만 `category_min = '식당'`으로 옮겼다.
- 이 기준(service_category_id 유무)은 이름 키워드 매칭이 아니라 관리자의
  명시적 판단이라, `category_min_source`는 'RULE'이 아니라 **'MANUAL'**로
  표시했다(RAW/RULE/MANUAL 기존 3단 구분 재사용 — [[2026-09-06-daycare-
  kindergarten-category]]에서 이름 키워드로 재분류했을 때 'RULE'을 썼던 것과
  구분).

### 검증(실측)
적용 후 재확인: `놀이방식당` 40건(그대로) + `식당` 1,788건 = 1,828건, 사전
확인과 정확히 일치.

### 안전망 목록도 함께 갱신
`src/lib/admin/category-min-fallback.ts`의 `OPEN_SPACES_CATEGORY_MIN_FALLBACK`
에 `'식당'`을 추가했다(어린이집/유치원과 동일한 판단).

## 의도적으로 하지 않은 것 — category-min-groups.ts 정적 그룹
open_spaces에는 현재 "식사/식당" 계열의 대분류가 존재하지 않고(체육시설/
문화시설/자연공원/농장체험/키즈놀이시설/공공청사대관/기타), '식당'을 넣을
자연스러운 기존 대분류가 없다. [[2026-09-06-daycare-kindergarten-category]]와
동일한 이유(`spot-category-groups.test.ts`의 교차검증 테스트가 이 정적 그룹을
사용자용 화면의 `CORE_SPOT_CATEGORIES`와 강제로 일치시킴 — 대분류를 새로
만들거나 기존 대분류에 편입하면 사용자용 화면까지 함께 바꿔야 해 이번 요청
범위를 벗어남)로, '식당'은 `buildCategoryMinGroups()`의 기존 폴백 로직에
의해 "기타" 그룹으로 자동 편입되도록 두었다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 전체 통과(순수 문자열 배열 추가라 신규 테스트는 추가하지
  않음 — [[2026-09-06-daycare-kindergarten-category]]와 동일한 판단).
- `npm run build` 통과.

## 특이 사항
- 이번 작업도 DB 데이터 재분류가 핵심이고, 코드 변경은 안전망 스냅샷 갱신
  1건뿐이다.
