# 이벤트픽 "공공 키즈카페" → "키즈놀이터" 개명 + open_spaces "키즈카페" 중분류 편입

## 구현 대상
사용자 지시: "이벤트픽에서 공공키즈카페 대분류에 대하여 키즈놀이터? 로 바꾸고.. 여기의
중분류를 기존 2개 공공키즈카페, 어린이 실내놀이터 에 추가로 open_spaces의 키즈카페
중분류 가져와서 놔줘."

## 구현 일시
2026-09-05

## 변경 사항
이 taxonomy는 "반드시 동일하게 유지"해야 하는 여러 사본이 있어(코드 자체 지침), 개명과
중분류 추가를 모든 사본에 함께 반영했다:

- `src/lib/spaces/category-maj-meta.ts`(이벤트픽 홈 화면 대분류 정의, 원본):
  `maj: '공공 키즈카페'` → `'키즈놀이터'`, `minorCategories`에 `'키즈카페'` 추가
  (`['공공키즈카페', '어린이실내놀이터', '키즈카페']`).
- `scripts/ingest/lib/category-maj-taxonomy.mjs`(수집 파이프라인 사본):
  `공공키즈카페`/`어린이실내놀이터` 값을 `'키즈놀이터'`로, `키즈카페: '키즈놀이터'` 신규
  추가(체험휴양마을 등과 동일하게 — 이 어댑터 파이프라인이 직접 배정하는 값은 아니지만
  taxonomy 일관성을 위해 등록).
- `src/lib/home/get-home-feed.ts`: `SHARED_OPEN_SPACES_CATEGORY_MINS`에 `'키즈카페'`
  추가 — 이게 있어야 실제로 `getCategoryMinFeed('키즈카페', ...)`가 open_spaces 행을
  조회한다(라벨/중분류만 추가하고 이 Set에 안 넣으면 화면엔 옵션만 보이고 데이터는
  0건으로 남는다).
- `src/lib/ai-chat/search-engine.ts`: `VIBE_TO_EVENT_MAJ.KIDS_CAFE`를 `'키즈놀이터'`로
  갱신(`VIBE_EVENT_CATEGORY_MINS`가 `CATEGORY_MAJ_OPTIONS.maj`로 조회해 파생되므로,
  이 값이 어긋나면 챗봇의 이 vibe용 이벤트 검색이 조용히 빈 배열이 되는 회귀가 생긴다).
- `src/lib/ai-chat/step-options.ts`: 챗봇 분위기 선택 버튼 라벨도 동일하게 `'키즈놀이터'`로.
- 테스트 5개 파일 갱신(라벨 문자열 교체): `major-category-grid.test.tsx`,
  `search-engine.test.ts`, `step-options.test.ts`,
  `scripts/ingest/lib/category-maj-taxonomy.test.mjs`(신규 검증 테스트 1개 추가 포함).

챗봇의 `VIBE_CATEGORY_MINS.KIDS_CAFE`(open_spaces 쪽 매핑)는 이미 `'키즈카페'`를
포함하고 있었다(2026-09-03 이전부터) — 이번 변경으로 이벤트픽 홈 화면도 그 정의를
따라가 두 화면의 "키즈놀이터"가 가리키는 데이터 범위가 같아졌다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 108개 파일 / 1135개 테스트(기존 1134개 + 신규 1개) 전체 통과.
- `npm run build` 통과.

## 특이 사항
- **"키즈놀이터"라는 정확한 이름은 사용자가 "?"를 붙여 제안한 것**이라 다른 표현을
  원하면 언제든 `category-maj-meta.ts`/`category-maj-taxonomy.mjs`/`search-engine.ts`/
  `step-options.ts` 4곳(+테스트)만 함께 바꾸면 된다 — 이번 작업으로 "여러 곳에 흩어진
  라벨을 전부 같이 바꿔야 한다"는 사실 자체가 코드/테스트로 명확히 드러났다.
- 이 대분류는 이제 이벤트(공공키즈카페/어린이실내놀이터, SEOUL_YEYAK 서울형 한정)와
  open_spaces(키즈카페, GG_KIDSCAFE — 민간 포함 더 넓은 경기 지역 데이터)를 함께
  보여준다 — 두 소스의 실제 커버리지(서울 공공기관 한정 vs 경기 민간 포함)가 다르다는
  점은 그대로 남아 있다(이번 지시 범위 밖).
