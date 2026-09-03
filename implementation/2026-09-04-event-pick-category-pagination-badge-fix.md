# 이벤트픽 대분류/바텀시트 구조 복구·페이지네이션·카드 뱃지 정리

## 구현 대상
사용자 지시(원문 3항목):
1. "이벤트픽 대분류 탭 + 바텀시트(중분류) 구조 복구 및 재적용" — 상단에 6대 대분류를
   배치하고, 대분류 클릭 시 중분류 바텀시트가 확실히 뜨며, 중분류 선택 시 데이터가
   정확히 필터링되도록 연동을 바로잡는다.
2. "중분류 데이터 로딩 속도 개선 (페이지네이션 도입)" — 중분류 선택 시 한 번에 너무
   많은 데이터가 불려와 로딩이 지연되는 문제를 페이지네이션/끊어읽기로 해결한다.
3. "이벤트 카드 텍스트 영역 불필요한 뱃지 제거" — "키즈/어린이" 등 거슬리는 뱃지를
   텍스트 영역에서 아예 노출하지 않는다.

## 구현 일시
2026-09-04

## 변경 사항

### 1. 이벤트픽 대분류 6종으로 축소 (스포츠 대여 제거)
코드/데이터를 실측한 결과, 기존 7대 대분류 중 "스포츠 대여"(테니스장/축구장/체육관 등
15개 중분류)는 이벤트픽 화면에서 사실상 작동하지 않았다 — 이 화면은 "오늘 진행 중인
가족 대상 이벤트"만 카운트하는데, 15개 중 12개(테니스장·축구장·체육관·운동장·수영장
등)는 그 조건에 항상 0건이라 바텀시트를 열어도 칩 자체가 하나도 안 보였고, 나머지
3개(스포츠/야구장/풋살장)도 2~4건뿐이었다(개선사항 3의 categoryCounts 0건 제외 로직이
의도대로 정상 작동한 결과였을 뿐, 그 로직 자체의 버그는 아니었다). 이 시설들은
open_spaces에 실제로 수백 건씩 존재하지만(테니스장 705건, 축구장 363건, 체육관 524건 등)
캠핑장/체험휴양마을/교육농장/체험학습장(개선사항 4)처럼 SHARED_OPEN_SPACES_CATEGORY_MINS에
등록돼 있지 않아 연동되지 않았다.

사용자에게 두 가지 대안(① 6대로 축소, ② open_spaces 연동 확장으로 스포츠 대여도 되살림)을
제시해 확인받은 결과, **① 6대로 축소**를 선택했다 — 방금 챗봇 vibe taxonomy(2026-09-03)와
정확히 동일한 6종으로 두 체계가 완전히 일치하게 됐다.

변경 파일:
- `src/lib/spaces/category-maj-meta.ts`: `CATEGORY_MAJ_OPTIONS`에서 "스포츠 대여" 항목
  제거(7→6). `MajorCategoryGrid`/`EventBrowseSheet`/`category-min-counts`/
  `migrate-to-event` 등 이 배열을 소비하는 모든 화면이 자동으로 6종만 반영한다(단일
  소스, 제5장 제4조 기존 구조 우선).
- `scripts/ingest/lib/category-maj-taxonomy.mjs`: "반드시 동일하게 유지하라"는 상단
  지침에 따라 `CATEGORY_MAJ_OF`의 해당 15개 category_min 매핑값을 `null`로 바꿨다
  (기존 소비 코드가 `CATEGORY_MAJ_OF[key] ?? null`로 이미 null-safe해 안전).
- 기반 데이터(category_maj='스포츠 대여'로 이미 태깅된 events 행, category_min 자체)는
  삭제하지 않는다 — 이 UI 목록에서만 더 이상 선택할 수 없을 뿐이다.
- 테스트: `major-category-grid.test.tsx`(6개 라벨만 확인), `category-maj-taxonomy.test.mjs`
  (2개 테스트 갱신 + null 매핑 회귀 테스트 추가) 갱신.

바텀시트 자체의 동작(대분류 클릭→시트 슬라이드업→중분류 선택→쿼리→카드 렌더링)은
코드 리뷰 결과 이미 정상이었다(2026-09-03 개선사항 3에서 확인 완료, 이후 커밋 이력 추적
결과 이 로직에 손댄 변경 없음) — "복구"가 필요했던 것은 시트 메커니즘이 아니라 위 데이터
연동 공백이었다.

### 2. 중분류 데이터 로딩 속도 개선 — 페이지네이션(더보기) 도입
실측 원인: `getCategoryMinFeed`는 "지역 우선순위 재정렬" 품질을 위해 매 요청마다
이벤트/공간 테이블 각각 최대 500건씩(지역 범위를 3단계로 넓혀가며 최악의 경우 테이블당
최대 1,500건)을 미리 가져온 뒤, 정작 화면에는 20건만 보여줬다. 흔한 중분류(예: 캠핑장
3,857건)일수록 이 500건 상한을 항상 그대로 채워, 필요한 데이터양(20건)과 실제로
내려받는 데이터양의 격차가 응답 지연의 직접적인 원인이었다.

변경 파일:
- `src/lib/home/get-home-feed.ts`:
  - `getCategoryMinFeed`에 `offset` 인자를 추가(기본 0 = 기존과 동일 동작).
  - DB 조회 상한을 고정 500 대신 `min(500, offset+limit+60)`으로 낮췄다(1페이지
    기준 500→80, 약 6배 감소) — 500은 안전망으로 유지.
  - `fetchRegionFirstRows`에 넘기는 `minRequired`도 `offset+limit`로 바꿔, 페이지가
    깊어질수록 필요한 만큼만 더 가져온다.
  - `selectRegionFirst`(이 함수의 유일한 호출부)에 `offset` 인자를 추가해
    `slice(offset, offset+limit)`로 페이지를 잘라낸다.
- `src/app/api/home/category-feed/route.ts`: `offset` 쿼리 파라미터를 추가하고,
  응답에 `hasMore`(이번 페이지가 페이지 크기만큼 꽉 찼는지로 판단하는 표준적인
  휴리스틱)를 포함한다.
- `src/components/home/home-view.tsx`: `useCategoryFeed` 훅에 `isLoadingMore`/
  `hasMore`/`loadMore`를 추가 — 중분류 선택 시 1페이지(20건)만 받고, "더보기" 버튼을
  누를 때만 다음 페이지를 이어붙인다(사용자 지시의 "적절한 단위의 끊어읽기"를 무한
  스크롤 대신 명시적 버튼으로 구현 — 더 단순하고 테스트 가능함).
- 테스트: `get-home-feed.test.ts`에 페이지 간 겹침/누락이 없는지 검증하는 테스트 추가,
  `home-view.test.tsx`에 "더보기" 클릭 시 offset을 실어 재요청하고 기존 카드에
  이어붙이는 흐름 검증 테스트 추가.

### 3. 이벤트 카드 텍스트 영역 "키즈/어린이" 뱃지 완전 제거
`src/lib/spaces/parental-badges.ts`의 `getEventBadges`에서 'kids' 뱃지(👶 키즈/어린이,
👶 유아전용)를 생성하는 로직 자체를 제거했다 — 이벤트픽은 애초에 가족/아동 대상
콘텐츠만 다루므로(`EVENT_PICK_TARGET_AUDIENCES`) 카드마다 반복 표시할 실익이 적다는
지적에 따른 것이다. `getSpaceBadges`(스팟픽 화면 전용)의 'kids' 뱃지는 이번 지시
대상이 아니므로 그대로 유지했다.

소스 함수에서 제거했으므로 EventCard(카테고리 그리드/검색/무료 피드 등)와
HeroCarousel(오늘의 추천 행사) 양쪽 모두에서 자동으로 사라진다 — 이 김에 오직 'kids'
하나만 숨기던 특례 코드도 함께 제거했다(더 이상 만들어지지 않는 뱃지를 숨길 필요가
없어져 죽은 코드가 됨):
- `src/components/cards/event-card.tsx`: `hideBadgeKeys` prop과 필터 로직 삭제(유일한
  용도가 'kids' 숨기기였음).
- `src/components/home/reservation-open-slider.tsx`: `hideBadgeKeys={['kids']}` 사용
  제거.
- `src/components/home/hero-carousel.tsx`: `supplementBadges` 필터에서 `'kids'` 조건
  제거(facility_type만 남음).
- 테스트: `event-card.test.tsx`(hideBadgeKeys 전용 describe 삭제, 키즈 뱃지 미노출
  회귀 테스트 추가), `hero-carousel.test.tsx`, `parental-badges.test.ts` 갱신.

## 특이 사항
- 대분류 축소는 사용자에게 직접 확인(AskUserQuestion)을 받은 뒤 진행했다 — 데이터
  삭제가 아니라 UI 노출 범위 축소이며, admin 마이그레이션 드롭다운/이벤트 브라우즈
  시트 등 CATEGORY_MAJ_OPTIONS를 공유하는 다른 화면에도 일관되게 반영된다.
- 페이지네이션은 무한 스크롤이 아니라 "더보기" 버튼으로 구현했다(사용자 지시에 명시된
  대안 중 하나) — IntersectionObserver 없이 더 단순하고 결정적으로 테스트할 수 있다.
- 검증: `npx tsc --noEmit` 통과, `npm run test`(97개 파일/1009개 테스트) 전체 통과,
  `npm run build` 프로덕션 빌드 통과. 브라우저 실기동 확인은 이 환경에 브라우저/
  스크린샷 도구가 없어 수행하지 못했다 — 렌더링 구조는 테스트가 검증한 DOM 스냅샷으로
  대신 확인했다.
