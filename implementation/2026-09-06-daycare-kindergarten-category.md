# open_spaces 표준 중분류 신규 2종 추가 — "어린이집" / "유치원"

## 구현 대상
사용자 지시: "open_spaces쪽에 표준중분류에 대하여 '어린이집', '유치원' 표준중분류
2개 더 추가해서 만들고 어린이 놀이시설(실내) 중분류에 있는 데이터들에 대하여
제목/명칭에 어린이집이 들어가면 중분류를 어린이집으로 바꾸고 유치원 글자가
들어가면 유치원으로 중분류 바꿔줘"

## 구현 일시
2026-09-06

## 변경 사항

### DB — category_rules 등록 + 기존 데이터 재분류
`scripts/migrations/2026-09-06-add-daycare-kindergarten-category-min.sql`
(적용 완료):
- `category_rules`에 `('open_spaces', '어린이집', '어린이집', false)`,
  `('open_spaces', '유치원', '유치원', false)` 2건 등록. `get_category_min_options`
  RPC가 이 테이블을 Source of Truth로 삼으므로(2026-08-26-category-rules-engine.sql),
  이 등록만으로 "표준 중분류" 목록에 두 값이 새로 나타난다. 부수 효과로 앞으로
  새로 수집되는(category_min이 NULL인) 행도 이름에 해당 키워드가 있으면 기존
  "[규칙 기반 일괄 재분류 실행]" 버튼으로 자동 분류된다.
- 기존 "일괄 재분류" 버튼(`applyCategoryRulesToTable`)은 `category_min IS NULL`인
  행만 대상으로 하므로, 이미 `category_min = '어린이놀이시설(실내)'`로 채워진
  기존 행에는 적용되지 않는다 — 사용자가 명시한 범위(그 중분류 데이터만) 그대로
  직접 UPDATE 2건을 실행했다(`name like '%어린이집%'` → `category_min='어린이집'`,
  `name like '%유치원%'` → `category_min='유치원'`). `category_min_source='RULE'`로
  표시해 기존 RAW/RULE/MANUAL 3단 구분을 그대로 재사용, 추적 가능하게 했다.

### 검증(실측)
- 사전 확인: `category_min='어린이놀이시설(실내)'` 1,788건 중 이름에 "어린이집"
  포함 203건, "유치원" 포함 90건, 둘 다 포함 0건(순서 무관하게 안전).
- 적용 후 재확인: `어린이놀이시설(실내)` 1,495건(그대로) + `어린이집` 203건 +
  `유치원` 90건 = 1,788건, 사전 확인과 정확히 일치.
- `get_category_min_options('open_spaces')` RPC 직접 호출 → 총 57개 옵션에
  `'어린이집'`, `'유치원'` 둘 다 포함 확인.

### 안전망 목록도 함께 갱신
`src/lib/admin/category-min-fallback.ts`의 `OPEN_SPACES_CATEGORY_MIN_FALLBACK`
(RPC가 재시도까지 모두 실패했을 때만 쓰이는 최후의 방어 코드, 서비스 데이터의
원천 아님)에도 `'어린이집'`, `'유치원'`을 추가해 스냅샷을 최신화했다. 이 목록은
실시간 조회가 완전히 실패하는 드문 경우에만 쓰이지만, "표준 중분류 2개 추가"라는
요청의 취지에 맞춰 함께 갱신하는 것이 합리적이라 판단했다.

## 의도적으로 하지 않은 것 — category-min-groups.ts (키즈/놀이시설) 그룹
Admin 계층형 필터(`src/lib/admin/category-min-groups.ts`)의 "키즈/놀이시설" 대분류
정적 목록에는 `'어린이집'`/`'유치원'`을 추가하지 않았다. 이유:
`src/lib/spaces/spot-category-groups.test.ts`가 이 정적 그룹(체육시설/공공청사
대관/기타 제외)이 사용자용 서비스 화면의 `CORE_SPOT_CATEGORIES`
(`src/lib/spaces/spot-category-groups.ts`)와 정확히 일치하도록 강제하는
교차검증 테스트를 갖고 있다 — 여기 추가하면 사용자용 화면의 카테고리 필터까지
함께 바꿔야 하는데, 이는 이번 요청(Admin 데이터 분류 작업)의 범위를 벗어난다
(제3장 제5조 추측 금지, CLAUDE.md 역할/범위 원칙). 두 신규 값은
`buildCategoryMinGroups()`의 기존 폴백 로직에 의해 "기타" 그룹으로 자동
편입되므로 체크박스 자체가 누락되는 일은 없다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test` 전체 통과(기존 테스트 스위트 — 이번 변경은 fallback 배열에
  문자열 2개를 추가한 것뿐이라 신규 테스트는 추가하지 않았다. 배열 내용을 직접
  검증하는 기존 테스트가 없어 회귀 위험 없음을 확인).
- `npm run build` 통과.

## 특이 사항
- 이번 작업은 DB 데이터 재분류(마이그레이션 SQL)가 핵심이고, 코드 변경은
  안전망 스냅샷 갱신 1건뿐이다.
- 재분류는 사용자가 명시한 범위(`어린이놀이시설(실내)` 안에서만) 그대로,
  다른 중분류의 데이터는 건드리지 않았다.
