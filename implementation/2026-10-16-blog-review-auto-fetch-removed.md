# 스팟픽 블로그 후기 — 자동 조회/캐싱 기능 폐지 (수동 큐레이션만 노출)

## 구현 대상
사용자 지시(2026-10-16, 위키/MOKA 오탐 버그 보고 직후): "유지하지마.. 일단
입력한것만 받는걸로 해 지금 신뢰성이 바닥이라는걸 알았으니 ... 보여주는
거보다 안보여주는게 나아. 수동으로 체크한 블로그.. 외에는 다 없애."

이번 버그 수정(`2026-10-16-blog-review-auto-cache-trust-filter-fix.md`,
Decision 039)으로 신뢰도 검증 로직 자체는 고쳤지만, 사용자가 "같은 종류
사고가 또 날 수 있다"고 판단해 자동 조회 기능 전체를 폐지하기로 결정했다.

## 구현 일시
2026-10-16

## 변경 사항
### `src/app/api/spot-blog-reviews/route.ts`
관리자 큐레이션(`spot_curations.blog_url_1..3`) 조회 단계만 남기고, 캐시
확인/네이버 블로그 재검색 단계를 전부 제거했다. 큐레이션이 없으면
`{ urls: [], source: 'none' }`을 그대로 반환해 프런트엔드가 영역을 숨긴다
(기존 응답 스키마 그대로라 `detail-modal.tsx`는 수정 불필요 — `source`
값을 분기하지 않고 `urls` 배열만 사용하고 있었음).

### `src/lib/spaces/blog-review-cache.ts` / `.test.ts` 삭제
캐싱 신선도 판정(`isBlogCacheFresh`)과 신뢰도 검증(`isTrustedBlogItem`,
`selectTrustedBlogUrls`)은 이 라우트 하나만 쓰던 로직이라(다른 어떤
파일도 import하지 않음, 실측 확인), 라우트에서 그 단계를 없애면서
완전히 쓰지 않는 코드가 됐다 — 파일 전체를 삭제했다.

관리자 큐레이션 화면(`use-spot-curation-form.ts`)의 별개 워닝 판정
함수(`hasRegionMismatch`)는 이번 삭제와 무관하게 그대로 남아있다(이름이
비슷해 혼동하기 쉬우나 별도 구현, 애초에 다른 파일).

### 데이터 — 전체 캐시 컬럼 초기화
`open_spaces.blog_review_urls`/`blog_review_updated_at`에 남아있던 모든
값(직전 수정에서 신뢰도 재검증을 통과해 남겨뒀던 3건 포함)을 비웠다 —
이제 이 컬럼을 읽는 코드가 없어 데이터로서의 의미가 없다.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(329개 파일 3,275개 테스트,
  blog-review-cache.test.ts 16개 삭제로 정확히 16개 감소) / `npm run build`
  전부 통과.
- DB 직접 조회로 `blog_review_urls`가 있는 행이 0건임을 확인.

## 특이 사항
- `open_spaces.blog_review_urls`/`blog_review_updated_at` 컬럼 자체는
  삭제하지 않았다 — 사용자 지시는 "노출되는 블로그"에 관한 것이었고,
  스키마(컬럼) 삭제는 별도의 더 큰 결정이라 이번 범위에 포함하지 않았다.
  필요하면 후속 지시로 마이그레이션해 정리한다.
- 관리자 큐레이션에서 쓰는 네이버 블로그 검색 공용 모듈(`naver-blog-
  search.ts`, `blog-search-server.ts`)은 건드리지 않았다 — 이번에 폐지한
  건 "자동으로 찾아서 사용자에게 보여주는" 경로뿐이고, 관리자가 직접
  검색해 고르는 수동 큐레이션 워크플로는 그대로 유지된다(사용자 지시
  "수동으로 체크한 블로그.. 외에는 다 없애"와 정확히 일치).
