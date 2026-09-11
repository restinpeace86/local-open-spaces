# 이벤트 블로그 큐레이션 하이라이팅 + 가독성 개선 — Step 116

## 구현 대상
사용자 지시(2026-09-11, Step 115 결과 확인 중 추가 요청): "이벤트쪽의 블로그
큐레이션에도 가격이나 연령과 관련된 단어들에 대하여 블로그 1,2,3에서 찾아서 노란색
형광펜 색칠해줘. 그리고 블로그의 가독성을 위하여 줄바꿈도 해줘 — 현재는 텍스트가
줄바꿈 없이 쫙 나열되는데 실제 블로그는 안 그렇다." (배경: "최종적으로는 내가
확인하고 저장할 거야, 다만 그를 위해 최대한 손이 덜 가게" — 관리자의 수동 검수
부담을 줄이는 것이 목적.)

## 구현 일시
2026-09-11

## 1) 가격/연령 키워드 하이라이팅

### 문제
open_spaces의 스팟 큐레이션(`BlogCurationModal`)은 이미 지역명/연령 키워드를
`highlightKeywords`(카테고리 뱃지 키워드 + extraKeywords)로 하이라이트하고 있었지만,
이 함수는 항상 `categoryId`(노출 중분류, 기본값 식당)의 뱃지 키워드를 함께 섞는다.
이벤트는 "노출 중분류" 개념 자체가 없어 `EventBlogCurationModal`은 애초에
`curationCategoryId`를 넘기지 않았고, 그 결과 하이라이팅이 전혀 적용되지 않고
있었다.

### 변경 사항
- **`src/lib/admin/curation-badges.ts`**:
  - `<mark>` 래핑 로직을 `wrapMatchesWithMark`로 분리(기존 `highlightKeywords`가
    쓰던 로직 그대로 재사용).
  - 신규 `highlightKeywordsOnly(text, keywords, rawPatterns?)` — 카테고리 뱃지
    키워드 없이 주어진 키워드/정규식 패턴만으로 하이라이트한다.
  - 신규 `PRICE_HINT_KEYWORDS`(무료/유료/요금/가격/참가비/입장료/이용료/수강료/
    관람료/할인) — 기존 `AGE_HINT_KEYWORDS`와 동일한 방식.
  - 신규 `PRICE_AMOUNT_PATTERN`("[0-9][0-9,]{2,}\\s*원") — "10,000원"처럼 숫자와
    결합된 금액 표기를 정규식으로 잡는다. **"원" 한 글자만 키워드로 넣지 않은
    이유**: "공원"/"회원"/"정원" 등 무관한 단어까지 전부 형광펜 처리돼 오히려
    가독성을 해친다는 점을 실제로 테스트해 확인했다 — 숫자 결합 패턴만 안전하게
    매칭한다.
- **`src/components/admin/blog-reference-viewer.tsx`**: `curationCategoryId`가
  있으면(기존 스팟 호출부, 항상 넘김) 기존 `highlightKeywords` 그대로, 없으면
  (신규 이벤트 호출부) `highlightKeywordsOnly`를 쓰는 `highlight()` 헬퍼로 통일.
  신규 `extraHighlightPatterns` prop 추가(리터럴이 아닌 완성된 정규식 패턴 전달용).
- **`src/components/admin/event-blog-curation-modal.tsx`**: `BlogReferenceViewer`에
  `extraHighlightKeywords={[...AGE_HINT_KEYWORDS, ...PRICE_HINT_KEYWORDS]}`,
  `extraHighlightPatterns={[PRICE_AMOUNT_PATTERN]}` 전달. `curationCategoryId`는
  여전히 넘기지 않아(이벤트는 노출 중분류 없음) 식당 등 무관한 카테고리 뱃지
  키워드가 섞이지 않는다.

## 2) 블로그 본문 줄바꿈(가독성)

### 원인
`src/lib/admin/naver-blog-body.ts`의 `extractBlogBodyText`가 `container.
structuredText`(node-html-parser가 `<p>`/`<div>`/`<br>` 등 블록 경계마다 넣어주는
개행)를 뽑아낸 뒤 `.replace(/\s+/g, ' ')`로 **개행을 포함한 모든 공백을 스페이스
하나로 뭉개고 있었다** — 실측 확인(node-html-parser 직접 호출)으로 정확한 원인을
찾았다. 그 결과 문단이 전부 한 줄로 이어 붙어 보였다.

### 변경 사항
- **`naver-blog-body.ts`**: 정규식을 개행이 아닌 공백(스페이스/탭)만 정리하도록
  바꿨다(`[^\S\n]+` → 한 칸, `\n` 앞뒤 공백 제거, 3개 이상 연속 개행은 문단 구분
  하나로 축소). 개행 자체는 그대로 보존된다.
- **`blog-reference-viewer.tsx`**: 본문을 보여주는 `<div>`에 `whitespace-pre-line`
  클래스를 추가해, 보존된 개행이 실제 줄바꿈으로 렌더링되게 했다(CSS 없이는
  HTML이 `\n`을 기본적으로 무시하므로 필수).
- 이 변경은 `naver-blog-body.ts`를 공유하는 스팟 큐레이션(BlogCurationModal/
  MobileCurationWorkbench) 화면에도 동일하게 적용된다 — 함께 가독성이 개선된다
  (제5장 제4조, 별도 요청 없었지만 같은 함수를 쓰는 자연스러운 부수 효과이며
  회귀가 아니라 개선).

## 검증
- `curation-badges.test.tsx`: `highlightKeywordsOnly` 신규 5건("원" 오탐 방지
  케이스 포함).
- `naver-blog-body.test.ts`: 기존 2건을 새 개행 보존 동작에 맞춰 갱신, 신규
  케이스 추가.
- `event-blog-curation-modal.test.tsx`: 신규 2건 — 가격/연령 키워드 하이라이트
  확인 + 식당 전용 키워드(주차 등)가 섞이지 않는지 확인.
- 기존 `blog-curation-modal.test.tsx`/`mobile-curation-workbench.test.tsx`(스팟
  전용, 항상 `curationCategoryId`를 명시적으로 넘김) 무회귀 확인 — 51건 그대로 통과.
- `npx tsc --noEmit` 통과.
- `npm run test`: 133 파일 1538건 통과.
- `npm run build`: Compiled successfully.
