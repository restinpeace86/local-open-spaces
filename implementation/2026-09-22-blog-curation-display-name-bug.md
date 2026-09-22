# [개선사항 1] 스팟 노출 이름 변경 시 블로그 검색어 연동 버그 수정

## 구현 대상
todo.md [개선사항 1]: 노출 이름을 수정해도 블로그 큐레이션 검색이 여전히
예전 이름으로 검색됨(예: "조마루감자탕" 사례). 시군구 접미사 부착 로직도
제거하고 정확히 노출 이름으로만 검색하도록 요청.

## 원인 (조사 결과)
`display_name`(2026-09-20 도입, 관리자 "노출 이름 수동 수정"/네이버 플레이스
크롤링으로 채워짐)을 실제로 읽는 곳은 스팟 큐레이션 폼(가격/영업시간/메뉴)
뿐이었고, **"블로그로 큐레이션" 검색 흐름은 애초에 `display_name` 필드
자체를 몰랐다** — 캐시나 리페치 버그가 아니라 단순히 값이 전달되지 않고
있었다:
- `use-spot-curation-form.ts`의 `SpotForCuration` 타입에 `display_name`이
  없었고, 검색어(`searchQuery`)는 `spot.name`(원본 상호명)만 사용했다.
- 이 훅을 쓰는 두 UI(`BlogCurationModal`, `MobileCurationWorkbench`)와 그
  호출부들(`raw-data-modal.tsx`, `category-mapping-panel.tsx`,
  `mom-pick-unmapped-spots-panel.tsx`) 모두 `spot` 객체를 만들 때
  `display_name`을 넘기지 않았다.
- **같은 버그가 사용자 화면에도 있었다**: `/api/spot-blog-reviews/route.ts`
  (스팟픽 상세 카드에 실제로 보이는 "📝 블로그 후기" 링크를 만드는 진짜
  사용자 대상 엔드포인트, 10일 TTL 캐시)도 `open_spaces.name`만 select해
  검색/신뢰도 검증에 썼다 — 관리자가 이름을 바꿔도 최대 10일간 옛 이름 기준
  블로그 링크가 그대로 캐시돼 있었다.

## 변경 사항

### 1) "블로그로 큐레이션"(관리자) 검색어를 display_name 우선으로 + 시군구 부착 제거
- `src/lib/admin/use-spot-curation-form.ts`: `SpotForCuration`에
  `display_name?: string | null` 추가. `searchQuery` 초기값과 마운트 시
  검색을 `buildSmartBlogQuery(spot.name, spot.sigungu_name)`(시군구 핵심
  지역명 부착) 대신 **`(spot.display_name ?? spot.name).trim()`을 가공 없이
  그대로** 쓰도록 변경. 결과 없을 때의 폴백 재검색(`buildFallbackBlogQuery`,
  시군구 접미사를 유지한 채 재검색)도 함께 제거(사용자 확인: "해당로직은
  제외해주고 정확히 스팟의 노출 이름 반영되면 해당 노출 이름으로 검색").
  지역명 하이라이팅(`regionKeywords`, `extractAllSigunguCoreNames`)은 검색어
  조합과 무관한 별개 기능이라 그대로 유지.
  **`buildSmartBlogQuery`/`buildFallbackBlogQuery` 함수 자체는 삭제하지
  않았다** — 이벤트 블로그 큐레이션(`use-event-blog-curation-form.ts`)과
  사용자 화면 블로그 후기(`spot-blog-reviews/route.ts`, 아래 2번)가 여전히
  쓰고 있어, 이번 요청("블로그로 큐레이션" 화면 한정)의 범위를 벗어난다.
- `src/components/admin/blog-curation-modal.tsx`: `spot` prop 타입에
  `display_name` 추가.
- `src/components/admin/mobile-curation-workbench.tsx`: `WorkbenchSpot`
  타입에 `display_name` 추가.
- 위 두 컴포넌트에 실제 `display_name` 값을 넘기는 3개 호출부 수정:
  - `src/components/admin/raw-data-modal.tsx`: `BlogCurationModal`의
    `spot={{...}}`에 `display_name: (row as AdminOpenSpaceRow).display_name`
    추가.
  - `src/components/admin/category-mapping-panel.tsx`: `AdminOpenSpaceRowLite`
    타입에 `display_name` 추가(이미 `/api/admin/data-grid`의
    `OPEN_SPACES_COLUMNS`에 포함된 컬럼이라 새 조회 없이 타입만 넓힘).
  - `src/components/admin/mom-pick-unmapped-spots-panel.tsx` →
    `src/lib/admin/mom-pick-unmapped-spots.ts`(`MomPickUnmappedSpot` 타입에
    `display_name` 추가) + `src/app/api/admin/mom-pick-unmapped-spots/route.ts`
    (select 절과 응답 매핑에 `display_name` 추가 — 이 라우트는 원래 select에
    없었어서 쿼리 자체를 수정).

### 2) 사용자 화면 블로그 후기(`/api/spot-blog-reviews/route.ts`)도 같은 버그 수정
`open_spaces` select에 `display_name` 추가, 검색어와 신뢰도 검증
(`selectTrustedBlogUrls`) 모두 `spot.display_name ?? spot.name`을 쓰도록
변경. **이 화면은 시군구 부착 로직 제거 대상이 아니라서(요청 원문이 "블로그로
큐레이션" 한정) `buildSmartBlogQuery`의 시군구 부착은 그대로 유지**했다.

### 3) 노출 이름 변경 시 블로그 후기 캐시 무효화 (근본 원인 추가 수정)
`src/app/api/admin/data-grid/display-name/route.ts`: `display_name`을 저장할
때 `blog_review_updated_at`도 함께 `null`로 초기화한다 — 그렇지 않으면 이름을
바꿔도 최대 10일간 옛 이름 기준으로 캐시된 블로그 후기 링크가 그대로 남아
있어, 위 1)/2)를 고쳐도 "노출 이름 수동 수정 쪽도 변경 반영되지 않고 있음"
(사용자 원문)이라는 증상이 최대 10일간 재현될 수 있었다. `blog_review_urls`
자체는 NOT NULL 컬럼이라 지우지 않고 남겨둔다(재검색이 외부 API 실패로
막히면 이 값이 안전한 폴백으로 쓰이는 기존 동작을 유지).

## 검증
- `npx tsc --noEmit` / `npm run test`(197개 파일 2270개, 회귀 없음 — 시군구
  부착 관련 기존 테스트 2개를 새 동작에 맞게 갱신, display_name 사용 검증
  테스트 2개 신규) / `npm run build` 모두 통과.

## 특이 사항
- `buildSmartBlogQuery`/`buildFallbackBlogQuery`(`naver-blog-search.ts`)는
  여전히 존재하며 이벤트 블로그 큐레이션과 사용자 화면 블로그 후기에서
  쓰인다 — "블로그로 큐레이션"(관리자, 스팟 전용) 화면 한 곳만 이번 요청대로
  시군구 부착을 껐다.
