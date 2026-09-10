# 스팟픽 네이버 블로그 후기 10일 캐싱(TTL) 백엔드 — 개선사항2-7 / Step 94

## 구현 대상
`implementation/todo.md` 개선사항2-7:
- 상세 카드 네이버 블로그 후기를 노출하되 매번 외부 Search API를 호출하지 않도록
  **10일 주기 캐싱(TTL)**.
- DB: 스팟별 최대 3개 블로그 링크(`blog_urls`) + 마지막 갱신 일시(`blog_updated_at`).
- 신뢰도 검증: "해당 조건으로 검색 + 주소가 제목이나 내용등에 포함" (관리자 블로그
  큐레이션 워닝과 동일 기준).
- Cache-Aside: `blog_urls` 비었거나 OR `blog_updated_at`로부터 10일 경과 → 재조회
  후 upsert. 아니면 캐시 즉시 반환. 결과 0건이면 영역 숨김.

## 구현 일시
2026-09-10

## 변경 사항
### DB — `scripts/migrations/2026-09-10-open-spaces-blog-review-cache.sql` (적용 완료)
- `open_spaces.blog_review_urls text[] not null default '{}'` (+ 최대 3개 check 제약)
- `open_spaces.blog_review_updated_at timestamptz` (NULL = 미조회)
- 기존 `open_spaces.blog_url`(단수, 수집 파이프라인 레거시)은 그대로 두고 소비자
  캐시는 별도 컬럼으로 분리.
- `gen-types.mjs`로 타입 갱신(+6줄).

### `src/lib/spaces/blog-review-cache.ts` (신규, 순수 함수 — 단위 테스트 대상)
- `isBlogCacheFresh(updatedAt, now?, ttlDays=10)`: NULL/미래/파싱실패 → stale, 0~10일 → fresh.
- `isTrustedBlogItem(item, regionCoreNames, spotName)`: 시군구 핵심 지역명이
  제목+본문(공백 무시)에 하나라도 등장하면 신뢰. 지역명을 모르면 상호명 포함
  여부로 대체(근거 없는 통과 방지 — 제3장 제5조).
- `selectTrustedBlogUrls(items, regionCoreNames, spotName, max=3)`: 통과 URL만
  중복 제거해 최대 3개.

### `src/lib/naver/blog-search-server.ts` (신규)
- `fetchNaverBlogItems(query, {sort, display})`: 관리자 `blog-search/route.ts`가
  인라인으로 갖고 있던 NAVER API HUB 호출을 공용 서버 헬퍼로 분리(재사용).
  기존 관리자 라우트는 건드리지 않음(회귀 위험 최소화).

### `src/app/api/spot-blog-reviews/route.ts` (신규)
- `GET ?spot_id=` — Cache-Aside 4단계:
  1. `spot_curations.blog_url_1..3`(is_active)에 사람이 검증한 URL이 있으면 그대로 반환 (`source: 'curation'`, 외부 API 미사용).
  2. `open_spaces.blog_review_urls`가 있고 10일 이내면 캐시 반환 (`source: 'cache'`).
  3. 아니면 `buildSmartBlogQuery`로 네이버 검색 → `selectTrustedBlogUrls`로 신뢰
     URL 최대 3개 → `open_spaces` upsert 후 반환 (`source: 'fresh'`).
     0건이어도 `blog_review_updated_at` 갱신(10일간 재호출 차단).
  4. 네이버 호출 실패 시 오래된 캐시(있으면)/빈 배열 조용히 반환 — 상세 카드가
     죽지 않도록(제5장 제11조).
- 응답: `{ item: { urls: string[], source } }`. `urls` 비면 클라이언트가 영역 숨김.

### 테스트
- `src/lib/spaces/blog-review-cache.test.ts` +12건 (TTL 경계, 신뢰도 검증, 최대 3개/중복 제거).
- 라우트 자체는 직접 테스트하지 않음(프로젝트 관례 — 로직은 순수 함수로 분리해 테스트).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 122 파일 1419건 통과(직전 1407 → +12).
- `npm run build`: Compiled successfully. `/api/spot-blog-reviews` 라우트 등록 확인.

## 특이 사항 / 후속
- **상세 카드 렌더링**(블로그 1/2/3 동적 버튼, 뒤로가기 상태 복원)은 개선사항3-5에서
  이 엔드포인트를 연결해 구현한다. 이번 커밋은 백엔드(컬럼 + 캐시 엔드포인트)까지.
- 실제 네이버 API 호출은 프로덕션 키가 있는 서버에서만 동작 — 로컬/CI에서는
  `result.ok === false` 경로로 빈 배열을 반환한다(상세 카드는 그대로 정상).
