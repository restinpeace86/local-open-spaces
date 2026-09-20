# [상시 추천 픽 테마별 분류]

## 구현 대상
사용자 지시(2026-09-20): 홈 화면 하단 "언제 가도 좋은 상시 추천 픽"(제휴 상품 중
`operation_end_date`가 없는 상시 상품 섹션)을 flat 카드 나열에서 테마 칩 5개로
나누고, 칩을 눌러야 그 테마에 맞는 카드가 나오는 구조로 바꾼다. "저렇게 5개로
제목도 언제가도 좋은 상시 테마별 추천픽으로 해주고 5개로 나눠 분류하고.. 저거
클릭하면 거기에 맞는 제휴 상품들 나오는 구조로 해줘." 위쪽 "엄선된 기간 한정
특가 픽"(시한성 상품)은 이번 변경 범위 밖이며 기존 flat 구조를 그대로 유지한다.

테마 5개는 실제 등록된 40건의 제휴 상품(전량 category='ticket')을 실측 분류해
정했고, "제휴상품.. 상품 티 안내고" 요청에 따라 상품/매장 용어("~점", "이용권",
"특가") 없이 "지금 뭘 하고 싶은지"로 포장한 문구를 확정본 그대로 썼다:
- KIDS_CAFE 🏠 아이들이 오늘 하루 신나게 뛰어놀 수 있는 곳
- THEME_PARK 🎢 온 가족이 하루 종일 알차게 즐길 수 있는 곳
- ANIMAL_AQUARIUM 🐘 동물들과 가까이서 교감할 수 있는 곳
- NATURE_EXPERIENCE 🌲 자연 속에서 몸으로 느끼고 배울 수 있는 곳
- SPECIAL_EXPERIENCE ✨ 평소와 다른 특별한 경험을 만날 수 있는 곳(기타 폴백)

## 변경 사항

### DB
`scripts/migrations/2026-09-20-curated-items-themes.sql`: `curated_items`에
`themes text[] not null default '{}'` 추가(다대다 다중 태깅 — `spot_curations.
curation_badges`와 동일한 기존 패턴, GIN 인덱스 없이 앱 레이어 필터링). 적용 후
`node scripts/gen-types.mjs`로 타입 재생성.

### 공용 로직 — `src/lib/home/curated-items.ts`
`CuratedItemThemeKey`, `CURATED_ITEM_THEME_OPTIONS`(5개, 이모지+문구),
`isCuratedItemThemeKey`, `filterCuratedItemsByTheme`(태그가 비어 있으면
SPECIAL_EXPERIENCE로 안전 폴백 — 관리자가 아직 안 고른 상품이 화면에서
조용히 사라지지 않게 함) 추가.

### 프론트엔드
- `src/components/home/best-pick-slider.tsx`: `CuratedItem` 타입에
  `themes?: string[] | null` 추가(BestPickSlider 컴포넌트 자체는 프레젠테이션
  전용이라 렌더 로직 변경 없음).
- `src/components/home/home-view.tsx`: "언제 가도 좋은 상시 추천 픽" 섹션을
  "🧸 언제 가도 좋은 상시 테마별 추천픽"으로 개명하고, `major-category-grid.tsx`와
  동일한 칩 스타일(rounded-full, 선택 시 `bg-gray-900`)로 테마 5개를 가로
  스크롤 칩으로 렌더링. 기본 선택 테마는 첫 번째(KIDS_CAFE) — 빈 화면으로
  시작하면 섹션이 통째로 비어 보이는 어색함을 피하기 위함. 선택한 테마에 0건이면
  슬라이더가 조용히 사라지는 대신 "이 테마에 해당하는 추천 픽을 준비 중이에요."
  안내 문구를 보여준다.

### 관리자 — `src/components/admin/curated-item-form-modal.tsx`
`CURATED_ITEM_THEME_OPTIONS`로 다중 선택 체크박스(칩 스타일) 추가.
`spot-curations-panel.tsx`의 `curation_badges` 체크박스와 같은 `Set<string>`
패턴이지만, 그 패널 특유의 "이미 저장된 값은 해제 불가" 제약은 이 상품
성격과 무관해 가져오지 않았다. 제출 payload에 `themes: [...selectedThemes]`
추가.

### API — `src/app/api/admin/curated-items/route.ts`
POST/PATCH 모두 `themes` 필드 처리 추가. `parseThemes()`가 배열이 아니거나
5개 키 밖의 값을 조용히 걸러낸다(DB check 제약 대신 앱 레이어 검증 — 이
프로젝트의 기존 관례).

### 데이터 백필 — `scripts/migrations/2026-09-20-backfill-curated-items-themes.mjs`
실제 등록된 40건 전체의 제목을 실측 조회해 키워드 기반으로 분류(추측 금지,
제3장 제5조 — ID를 하드코딩하지 않고 제목에 실제 등장하는 키워드로만 판정):
'키즈카페'→KIDS_CAFE, '동물원'/'아쿠아리움'→ANIMAL_AQUARIUM, '어드벤처'/
'서울랜드'/'테마파크'/'워터파크'/'원더빌리지'→THEME_PARK, '남이섬'/'트리하우스'/
'스누피가든'→NATURE_EXPERIENCE. `--dry-run`으로 먼저 확인 후 실행 — 40건 중
39건 반영(키즈카페 20건, 테마파크 6건, 동물원/아쿠아리움 6건, 자연체험 3건,
"[여수] 아르떼뮤지엄" 1건은 매칭 키워드가 없어 themes를 비워둔 채 화면에서
자동으로 "기타"로 폴백되도록 유지).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 170개 파일 2048개 테스트 전부 통과. 섹션 개명에 따라
  `home-view.test.tsx`의 기존 관련 테스트(빈 상태 라벨, 문구, 정렬 순서 검증)
  4곳을 새 제목/문구("🧸 언제 가도 좋은 상시 테마별 추천픽", "마감 걱정 없이,
  지금 하고 싶은 걸 골라보세요.")로 갱신했고, 정렬 순서 테스트에 쓰인 상시
  아이템에 `themes: ['KIDS_CAFE']`를 채워 기본 선택 테마(첫 번째 옵션)에서
  바로 보이도록 맞췄다.
- `npm run build` 통과.
- DB 백필: `--dry-run` 출력과 실제 반영 로그를 대조해 39/40건 의도대로
  반영됐음을 확인.

## 특이 사항
"동탄공룡월드&키즈카페" 계열 3건(동탄/천안/시흥)은 이름에 테마파크 요소
("공룡월드")가 섞여 있지만 실제 이용 형태가 키즈카페라 KIDS_CAFE 단일
태그만 부여했다(THEME_PARK 중복 태깅 안 함) — 세션 중 사용자와의 논의에서
이미 정리된 판단 기준을 그대로 반영.
