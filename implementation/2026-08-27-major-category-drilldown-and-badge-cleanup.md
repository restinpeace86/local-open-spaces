# [대분류·중분류 드릴다운 개편 + 카드 뱃지 정리]

## 구현 대상
1. 이벤트픽 홈 화면의 "5대 카테고리 Quick 그리드"(event_type 기반: 체험·클래스/야외·자연/
   전시·박물관/공연·축제/키즈·액티비티)를 실제 정제 파이프라인이 완성한 7대 대분류
   (category_maj)/중분류(category_min) 체계로 교체.
2. 대분류 클릭 → 그 아래 중분류 목록 노출 → 중분류 클릭 → 해당 중분류 카드 조회, 2단계
   드릴다운 UX 신규 구현.
3. "현재 이용 가능"/"예약 가능" 슬라이더에서 키즈/어린이 뱃지 제거, "완전 무료" 문구를
   "무료"로 단순화.

## 구현 일시
2026-08-27

## 1~2. 대분류·중분류 드릴다운

### 신규 파일
- `src/lib/spaces/category-maj-meta.ts`: 7대 대분류(자연/캠핑, 공공 키즈카페, 체험/농장,
  축제/이벤트, 문화/전시, 배움/클래스, 스포츠 대여) → 중분류 배열 매핑. `scripts/ingest/lib/
  category-maj-taxonomy.mjs`의 `CATEGORY_MAJ_OF`(수집 파이프라인 전용 .mjs 모듈이라 프론트엔드
  에서 직접 import 불가)를 그대로 복제했다 — 두 파일이 반드시 동기화 상태를 유지해야 함을
  주석으로 명시. `get-home-feed.ts`의 `EXCLUDED_CATEGORY_MIN`(16종)에 해당하는 값은 목록에서
  제외해(겹치는 건 "골프장" 1건뿐) 항상 0건만 나오는 죽은 선택지를 만들지 않았다.
- `src/components/home/major-category-grid.tsx`: `MajorCategoryGrid` 신규 컴포넌트 —
  대분류 아이콘 그리드 + 선택된 대분류의 중분류 칩 목록. 기존 `QuickCategoryGrid`는 건드리지
  않았다 — `/region`(스팟픽 카탈로그, 여전히 구 5대 카테고리 체계 사용)이 그 파일의
  `CATEGORY_IMAGE_SRC` export를 그대로 참조하고 있어 영향을 주면 안 되기 때문(제5장 제4조
  기존 구조 우선 — 독립된 새 컴포넌트로 분리).

### 백엔드
- `src/lib/home/get-home-feed.ts`: `getCategoryFeed`를 `getCategoryMinFeed`로 이름을 바꾸고
  필터를 `.eq('event_type', category)` → `.eq('category_min', categoryMin)`으로 교체(실측
  확인: 이 함수의 유일한 소비처는 `/api/home/category-feed`뿐).
- `src/app/api/home/category-feed/route.ts`: 파라미터 검증을 `isUiCategory`(구 5대 카테고리)
  에서 `isKnownCategoryMin`(신규 중분류 화이트리스트)으로 교체. 쿼리 파라미터 이름(`category`)
  자체는 하위 호환을 위해 그대로 두되 값의 의미만 바뀌었다.

### 프론트엔드
- `src/components/home/home-view.tsx`: `useCategoryFeed`에 `reset()` 추가. `selectedMaj`
  로컬 state(순수 UI, 조회를 트리거하지 않음) 신설 — 대분류를 바꾸면 `resetCategoryFeed()`로
  이전 중분류 선택/카드를 지운다. `QuickCategoryGrid` → `MajorCategoryGrid`로 교체.

## 3. 카드 뱃지 정리

- `src/lib/spaces/parental-badges.ts`: 이벤트 카드의 "🎁 완전 무료"를 "🎁 무료"로 변경(공간
  카드가 이미 쓰던 "🎁 무료" 표현과 통일 — 전역 적용, 다른 화면에서 이 문구를 다르게 유지할
  이유가 없다고 판단).
- `src/components/cards/event-card.tsx`: `hideBadgeKeys?: string[]` prop 신규 — 특정 뱃지
  key만 선택적으로 숨긴다. `EventCard`는 카테고리 그리드/검색/무료 피드 등 여러 화면이 공유하는
  컴포넌트라 전역으로 뺄 수 없어, 호출부 단위로 제어 가능하게 했다(제5장 제4조 기존 구조
  우선 — 새 카드 컴포넌트를 만들지 않음).
- `src/components/home/reservation-open-slider.tsx`: `hideBadgeKeys={['kids']}`를 전달해
  "현재 이용 가능"/"예약 가능"(이 컴포넌트의 유일한 두 소비처) 양쪽 모두에서 키즈/어린이
  뱃지를 숨긴다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 46 파일 497건 통과(신규: `major-category-grid.test.tsx` 5건,
  `event-card.test.tsx` 5건, `home-view.test.tsx`/`get-home-feed.test.ts`/
  `parental-badges.test.ts` 기존 테스트 신규 체계에 맞게 갱신).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버 실측: 홈 페이지에 7대 대분류 라벨 전부 렌더링 확인,
  `/api/home/category-feed?category=도시농업`(중분류 값) → 200, `?category=KIDS_ACTIVITY`
  (구 event_type 값) → 400(검증 정상 전환 확인), 페이지 전체에서 "완전 무료" 문구 0건 확인.

## 범위 밖 (임의 반영하지 않음)
- `/region`(스팟픽 카탈로그) 화면은 이번 지시 대상이 아니라 구 5대 카테고리 체계를 그대로
  유지했다.
- 대분류 아이콘은 이미지 자산이 없어 이모지로 표시했다(구 5대 카테고리처럼 커스텀 SVG를
  새로 만들지 않음 — 디자인 자산 제작은 이번 작업 범위 밖).
