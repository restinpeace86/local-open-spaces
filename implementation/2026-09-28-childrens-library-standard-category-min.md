# 어린이도서관 표준 중분류(category_min) 신규 생성 및 156건 이관

## 구현 대상
사용자 지시(2026-09-28): "표준중분류에 대하여 현재 '도서관'표준 중분류로 된거
'어린이도서관'으로 중분류 하나 새로 생성하고 여기에 156건만 이관해줄래?"

## 배경
순수 어린이도서관 156건(category_min='도서관', 이름에 "어린이/아동" +
"자료실" 제외, [[2026-09-27-library-candidate-badge-exclude-section-only]])은
이미 노출중분류(service_category_id)를 "어린이 도서관"으로 매핑해뒀지만
(구현: [[2026-09-27-childrens-library-service-category-and-operating-hours]]),
표준 중분류(category_min)는 여전히 일반 '도서관'과 같은 값이었다 — 이번엔
표준 중분류 자체를 분리한다.

## 변경 사항
### DB
`scripts/migrations/2026-09-28-split-childrens-library-category-min.sql`
(적용 완료):
1. `category_rules`에 `('open_spaces', '어린이도서관', '어린이도서관', false)`
   삽입 — `get_category_min_options()`가 이 테이블을 Source of Truth로 삼아
   어드민 드롭다운을 만들기 때문에, 새 표준 중분류를 "추가"하려면 이 등록이
   필요하다(2026-09-06-add-restaurant-category-min.sql과 동일 관례). 다만 이
   키워드는 이름에 "어린이도서관"이 정확히 붙어있는 경우만 잡아서(예:
   "국립어린이청소년도서관"은 "어린이"와 "도서관" 사이에 다른 말이 끼어 못
   잡음) 향후 신규 수집분을 완벽히 자동 분류하진 못한다 — 참고용 등록.
2. 156건 UPDATE: `category_min = '어린이도서관'`, `category_min_source =
   'MANUAL'`(이름 키워드 매칭이 아니라 관리자의 명시적 판단이므로 2026-09-06
   마이그레이션과 동일한 관례).
3. 적용 결과 확인: `도서관` 1,951 → 1,795건, `어린이도서관` 신규 156건.
   `get_category_min_options('open_spaces')`로 재조회해 새 값이 정상 노출됨을
   확인.

### 어드민/소비자 taxonomy 동기화
- `src/lib/admin/category-min-groups.ts`의 `OPEN_SPACES_GROUPS_STATIC`
  문화시설 그룹에 `'어린이도서관'` 추가(어드민 대분류 필터 UI 그룹핑).
- `src/lib/spaces/spot-category-groups.ts`의 `library` 칩(소비자 화면 카테고리
  필터)에 `minors: ['도서관', '어린이도서관']`로 반영 — **새 필터 칩을 만들지
  않고** 기존 "도서관" 칩 하나에 두 표준 중분류를 함께 담았다(제3장 제3조
  사용자 흐름 임의 변경 금지 — 표준 중분류 분리는 백엔드 분류 정밀화일 뿐,
  사용자가 보는 카테고리 목록 자체를 바꾸라는 지시는 없었음).
- `src/lib/admin/category-min-fallback.ts`의 안전망 목록에도 `'어린이도서관'`
  추가(기존 관례 — 새 표준 중분류 추가 시 이 목록도 함께 갱신).

## 검증
- `src/lib/spaces/spot-category-groups.test.ts`: 어드민 정의(OPEN_SPACES_
  GROUPS_STATIC)와 소비자 화면 정의(CORE_SPOT_CATEGORIES)의 대분류별 중분류
  구성이 정확히 일치하는지 검사하는 기존 테스트가 그대로 통과 — 두 파일을
  함께 갱신하지 않으면 이 테스트가 즉시 잡아낸다(실제로 이 테스트 존재를
  먼저 확인하고 두 파일을 함께 고쳤다).
- `npx tsc --noEmit` / `npm run test`(213개 파일 2,462개) / `npm run build`
  모두 통과.
- 실제 DB: 156건 이관 확인, RPC로 새 category_min 옵션 노출 확인.

## 특이 사항
- 노출중분류(service_category_id, "어린이 도서관")는 이미 있던 값 그대로다 —
  이번 변경은 표준 중분류(category_min)만 별도로 분리한 것이라 서로 다른
  두 개념이 이제 이름이 비슷해졌을 뿐 독립적으로 유지된다.
- 소비자 화면의 "도서관" 필터 칩을 누르면 이제 일반도서관(1,795건)과
  어린이도서관(156건)이 함께 나온다 — 필터를 더 세분화(예: "어린이도서관"
  전용 칩 신설)하고 싶으면 별도 지시가 필요하다(임의로 만들지 않음).
