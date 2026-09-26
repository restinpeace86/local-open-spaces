# "메뉴" 라벨 카테고리별 동적화 + 키즈메뉴 뱃지 카테고리 스코프

## 구현 대상
사용자 지시(2026-09-26, 자동 크롤링된 찜질방/스파 가격표를 확인하며):
"자동크롤링이야" (지난 "무료" 파싱 수정 대상이 크롤러 산출물임을 확인) +
"그래 결국 라벨이 이상한거 맞긴해 라벨을 동적으로 둘수있어? 식당일땐 메뉴가
맞지만 여기선 메뉴라고 사용자한테 보여선 안되는데".

## 확인 사항 (크롤링 경로 재확인)
사용자가 붙여넣은 실제 크롤링 결과("유아(12개월미만) 무료"가 한 줄로 붙어있음)로
확인한 결과, 어제(Step 57) 추가한 `MENU_LINE_FREE`(`"이름 무료"` 한 줄 형식)가
이 경우를 이미 정확히 처리한다 — 크롤러가 네이버 원본 `PlaceMenuItem.name`에
이미 "무료"가 포함된 텍스트를 그대로 넘겨주고, 우리 파서가 그 한 줄 형식을
0원으로 인식한다. 추가 수정 불필요, 기존 수정으로 커버됨을 실측으로 재확인.

## 변경 사항
`src/components/admin/spot-curations-panel.tsx`(`CurationFormModal`):
- `menuSectionLabel` — `curationCategoryId === 'spa_jjimjilbang'`이면 "가격표",
  그 외(식당 등 기존 전부)는 "메뉴". 데이터 구조(`spot_curations.menu_items`)는
  그대로 재사용하고(제5장 제4조 — 목욕탕 가격표도 같은 컨테이너를 쓰는 게 맞다는
  건 이전에 이미 확인됨), 화면 라벨만 카테고리에 맞게 바꾼다.
- `supportsKidsMenuBadge` — "🌟 [키즈메뉴] 뱃지" 체크박스는 `'kids_menu'`
  (restaurant 전용 뱃지 키)를 직접 켜고 끄는데, 이 체크박스가 카테고리 구분 없이
  항상 렌더링돼 있어서 놀이방찜질방/스파 스팟에서 체크하면 존재하지 않는 뱃지
  키가 `curation_badges`에 섞여 들어갈 수 있었다(Step 55에서 고친 badgeVoteHints
  누출과 같은 종류의 문제 — 라벨 질문에 답하면서 인접 코드를 보다가 발견). 이
  체크박스와 저장 로직 둘 다 `isKnownCurationBadgeKey(curationCategoryId,
  'kids_menu')`로 게이트를 걸어 그 뱃지 키가 실제로 존재하는 카테고리에서만
  보이고 저장되게 했다.

## 검증
- `src/components/admin/spot-curation-quick-modal.test.tsx`에 신규 테스트 2개:
  놀이방찜질방/스파는 "가격표" 라벨 + 키즈메뉴 체크박스 없음, 놀이방식당은
  기존과 동일하게 "메뉴" 라벨 + 체크박스 있음.
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,367개) / `npm run build`
  모두 통과.

## 특이 사항
- 이 라벨 분기는 `curationCategoryId`('spa_jjimjilbang' 문자열) 하나만 보고
  판단한다 — 나중에 표준중분류 기준 카테고리가 더 늘어나면(예: 키즈카페) 그때
  각 카테고리에 맞는 라벨을 이 삼항식에 추가하면 된다.
