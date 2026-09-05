# 블로그 큐레이션 3종 개선: 드래그 시 팝업 닫힘 버그 / 전체 본문 보기 / 수동 URL 교체

## 구현 대상
사용자 지시(원문 그대로 3가지 문제 제기):
1. "블로그 큐레이션관련하여 내용이 너무 적게나오고 짤리는데?"
2. "마우스로 살짝 드래그&드롭하면 팝업창이 그냥 꺼져 버려.."
3. "호박터숯불촌 실제로 네이버로 검색했을때랑 내쪽에서 팝업보기 할때랑은
   다른데? [blog.naver.com/yjsjhs/223844311455] 이 블로그 가져오는데 네이버
   블로그 관련도순 검색했을때 이거아니야.."

## 구현 일시
2026-09-05

## 1. 드래그 시 팝업이 꺼지는 버그

### 실측으로 확인한 원인
이 프로젝트의 배경 클릭 닫기 모달들(`RawDataModal`, `CategoryRulesModal`,
`CuratedItemFormModal`, `MigrateToEventModal`, `GroupDetailModal`)은 전부
"배경 div에 `onClick={onClose}` + 콘텐츠 카드 div에
`onClick={(e) => e.stopPropagation()}`" 패턴을 썼다. 이 방식은 클릭이 콘텐츠
카드 안에서 시작~끝까지 일어날 때만 안전하다 — 카드 안에서 텍스트를 드래그로
선택하다가 마우스가 카드 경계를 살짝 벗어난 채 버튼을 떼면, 브라우저는 그
`click` 이벤트를 "mousedown 지점과 mouseup 지점의 가장 가까운 공통 조상"에서
발생시킨다. 이 경우 공통 조상이 배경 div 자신이 되어, 콘텐츠 카드의
`stopPropagation`을 아예 거치지 않고 배경의 `onClose`가 곧바로 실행된다.

### 수정
`src/lib/admin/use-backdrop-dismiss.ts`(신규 훅) — "배경을 클릭해서 닫는다"는
mousedown과 click(mouseup) **둘 다** 배경 자기 자신에서 시작/종료했을 때만
인정한다. 카드 안에서 드래그를 시작했다면(mousedown 시점에 이미 카드 안이었다면)
마우스가 나중에 배경으로 삐져나가도 닫지 않는다.

적용한 5개 파일(전부 동일한 버그 패턴이었음): `raw-data-modal.tsx`,
`category-rules-modal.tsx`, `curated-item-form-modal.tsx`,
`migrate-to-event-modal.tsx`, `spot-dedup-panel.tsx`(`GroupDetailModal`).
`SpotCurationsPanel`의 등록/수정 폼은 원래부터 배경 클릭으로 닫히지 않도록
의도적으로 설계돼 있어(작성 중인 내용을 잃는 리스크 방지) 이 버그 자체가 없다 —
수정 대상에서 제외.

## 2. 블로그 내용이 너무 짧고 잘리는 문제 — 전체 본문 보기

### 실측으로 재확인 — 이전 판단(Decision 021)의 정정
Decision 021에 "실제 블로그 페이지 전체 본문은 iframe 안에 렌더링돼 있어
안정적으로 크롤링할 수 없다"고 적었던 건 **PC 버전(blog.naver.com)만 보고 확인
없이 내린 추측이었고, 실제로는 틀렸다**. 이번에 직접 재검증: `blog.naver.com`
URL을 `m.blog.naver.com`(모바일 버전)으로 바꿔 fetch하면, 본문이
`.se-main-container`(신형 스마트에디터) 또는 `#postViewArea`(구형)에 서버
렌더링된 HTML로 그대로 들어있다 — 실제 스팸 게시물 하나로 본문 45,000자 이상을
안정적으로 추출 확인했다.

### 변경 사항
- `src/lib/admin/naver-blog-body.ts`(신규): `toMobileNaverBlogUrl()`(blog.naver.com
  → m.blog.naver.com 변환, 네이버 블로그가 아니면 null), `extractBlogBodyText()`
  (jsdom으로 `.se-main-container`/`#postViewArea` 파싱, 제로폭 공백 제거,
  8,000자 상한). jsdom은 이미 이 프로젝트의 devDependency였으나 이제 프로덕션
  런타임(API 라우트)에서 쓰여 `dependencies`로 옮겼다(`package.json`,
  `@types/jsdom` devDependency 추가).
- `src/app/api/admin/spot-curations/blog-body/route.ts`(신규): `GET ?url=` —
  네이버 블로그면 본문을 반환(200), 아니거나 추출 실패면 422 + 명확한 이유
  문구(호출부가 조용히 요약 스니펫으로 폴백).
- `src/lib/admin/use-spot-curation-form.ts`: 현재 활성 탭의 링크가 바뀔 때마다
  (검색 결과 갱신/탭 전환) 전체 본문을 1회 시도해 `bodyByLink`에 캐시하고
  `activeBody`로 노출.
- `src/components/admin/blog-reference-viewer.tsx`: `activeBody.text`가 있으면
  요약 대신 전체 본문을 하이라이팅해 보여주고, 로딩 중엔 요약을 먼저 보여주며
  "전체 본문 불러오는 중..." 안내를 덧붙인다. 실패/미지원 시 기존 요약 스니펫으로
  조용히 폴백(제5장 제11조). 뷰어 높이도 `max-h-40` → `max-h-64`로 넓혔다.
- **저장/폐기 정책은 전혀 바뀌지 않음**: 이 전체 본문도 DB에 저장하지 않고
  화면 표시용으로만 쓰고 모달/워크벤치가 닫히면 폐기된다(기존 정책 그대로).

## 3. 검색 결과가 실제 네이버 검색과 다른 문제 — 수동 URL 교체

### 실측으로 확인 — 코드로 해결할 수 없는 네이버 쪽 검색 품질 문제
사용자가 제시한 실제 사례("호박터숯불촌")로 직접 재현했다:
- 우리 앱과 동일한 API(`sort=sim`)로 "호박터숯불촌"을 검색하면, 실제 그 식당과
  무관한 스팸성 블로그(`blog.naver.com/yjsjhs/223844311455` — 실제 본문을 열어
  보면 "1004가 전자기계 드론이아닌 나비의 곤충으로 관계를 바꿨다" 같은 완전히
  무관한 텍스트)가 관련도 1위로 나온다. 따옴표로 정확 매칭을 시도하거나 지역명
  ("영도")을 추가해도 순위가 바뀌지 않았다.
- 일반적인 쿼리("이태원 맛집")로도 상위 10건이 전부 티스토리이고 실제
  blog.naver.com 게시물이 하나도 없는 등, NAVER API HUB(2026-06-25 이관, 아직
  초기 단계)의 검색 품질이 라이브 네이버 웹사이트와 다르다는 것을 여러 쿼리로
  재현 확인했다.
- 이건 네이버의 검색 랭킹 알고리즘 자체의 문제라 우리 쪽 쿼리 문구를 바꾸는
  것으로 해결되지 않는다 — 정직하게 "코드로 고칠 수 없다"고 판단했다(추측으로
  스팸 필터링 휴리스틱을 만들지 않음, 제3장 제5조).

### 대안 — 수동 URL 교체
자동 검색이 틀렸을 때 관리자가 직접 (라이브 네이버 등에서) 찾은 정확한 URL로
현재 탭을 바꿔치기할 수 있는 탈출구를 추가했다.
- `src/lib/admin/use-spot-curation-form.ts`: `overrideActiveUrl(url)` — 현재
  활성 탭의 `blogItems[activeTab]`을 그 URL로 교체한 합성 항목으로 바꾼다(제목
  "(관리자가 직접 입력한 URL)", 나머지 메타데이터는 없음 — 네이버 블로그면 위
  전체 본문 기능이 자동으로 다시 시도된다).
- `src/components/admin/blog-reference-viewer.tsx`: "다른 URL로 바꾸기" 버튼 →
  인라인 입력창 + 적용/취소.
- 저장 시 이 교체된 URL이 그대로 `blog_url_N`에 들어간다(기존 저장 로직 변경 없음).

## 검증
- `npx tsc --noEmit` 통과(`@types/jsdom` 추가로 해소).
- `npm run test`: 115개 파일 / 1203개 테스트(기존 1185 + 신규 18: use-backdrop-
  dismiss 4, naver-blog-body 9, raw-data-modal 배경/드래그 2, blog-curation-modal
  전체본문/URL교체 3) 전체 통과.
- `npm run build` 통과, `/api/admin/spot-curations/blog-body` 라우트 정상 등록.
- 실측(dev 서버 직접 호출): 실제 blog.naver.com URL → 200 + 본문 텍스트 확인,
  비네이버 URL(tistory) → 422 + 명확한 에러 메시지 확인.

## 특이 사항
- jsdom으로 2.4MB 크기의 실제 블로그 페이지를 파싱하는 데 약 600ms이 걸렸다 —
  관리자가 버튼을 눌러 시작하는 온디맨드 동작이라(핫 패스 아님) 허용 가능한
  수준으로 판단했다.
- 티스토리 등 네이버 블로그가 아닌 출처의 전체 본문 스크래핑은 이번 범위에
  포함하지 않았다 — 블로그마다 템플릿이 제각각이라 범용 추출기를 추측으로
  만들지 않는다(제3장 제5조). 필요하면 출처별로 별도 확인 후 추가한다.
- Decision 021에 이번 정정 2건(6항 "본문 텍스트" 범위, 7항 검색 품질 문제)을
  추가했다 — 이전 기록을 조용히 지우지 않고 "[정정]"으로 남겨 무엇이 왜 틀렸는지
  추적 가능하게 했다.
