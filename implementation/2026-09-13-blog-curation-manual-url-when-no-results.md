# 블로그 큐레이션 — 자동 검색 0건이어도 URL 직접 추가 가능

## 구현 대상
사용자 지시(2026-09-13):
> 네이버 예약 링크를 걸려고 해도.. 이게 url 안주어지는데 ? 안으로 숨긴거
> 아니야 ?

## 구현 일시
2026-09-13

## 원인 확인
- 네이버 블로그 검색 API(`search/v1/blog`, `src/lib/naver/blog-search-server.ts`)는
  이름 그대로 "블로그 글"만 검색하는 엔드포인트다 — 네이버 예약(booking.naver.com)
  같은 다른 종류의 페이지는 이 API의 결과로 애초에 나올 수 없다(추측이 아니라
  API 스펙상 그렇다).
- 기존 "다른 URL로 바꾸기"(수동 URL 교체, 2026-09-05) 기능은 **이미 있는 검색
  결과 슬롯을 다른 URL로 바꿔치기**하는 용도로만 만들어져 있었다:
  - `blog-reference-viewer.tsx`에서 이 버튼/입력창은 `activeItem`(현재 탭의
    검색 결과)이 있을 때만 렌더링됐다. 검색 결과가 0건(`blogItems: []`)이면
    `activeItem`이 없어 입력창 자체가 화면에 그려지지 않았다.
  - `use-spot-curation-form.ts`의 `overrideActiveUrl`도 내부에서
    `if (!prev || !prev[activeTab]) return prev;`로 기존 슬롯이 없으면 아무
    것도 하지 않았다.
  - 즉 "숨긴 것"이 아니라, 검색 결과가 하나도 없는 상황 자체를 이 기능이
    처음부터 다루지 않았던 것이다.

## 변경 사항
1. `use-spot-curation-form.ts`의 `overrideActiveUrl`: 가드를
   `if (!prev || !prev[activeTab]) return prev;` → `const next = prev ? [...prev] : [];`로
   바꿔, 검색 결과가 없어도(빈 배열이어도) `activeTab` 위치에 새 항목을 만들 수
   있게 했다. 성공적으로 URL을 넣으면 `hasNoResults`도 `false`로 되돌려
   "관련 블로그 글을 찾지 못했습니다" 경고가 더 이상 잘못 남아있지 않게 했다.
2. `blog-reference-viewer.tsx`: `blogItems && blogItems.length === 0 &&
   onOverrideUrl` 조건일 때 "🔗 URL 직접 추가하기(예: 네이버 예약 링크 등)"
   버튼과 그 입력창을 새로 추가했다. 기존 "다른 URL로 바꾸기" 흐름과 동일한
   상태(`isEditingUrl`/`urlDraft`)와 함수(`applyUrlOverride`/`overrideActiveUrl`)를
   그대로 재사용했다 — 새 상태를 만들지 않았다(제5장 제4조).

이 `BlogReferenceViewer`/`useSpotCurationForm` 조합은 `BlogCurationModal`,
`EventBlogCurationModal`, `MobileCurationWorkbench`(category-mapping-panel.tsx/
mom-pick-unmapped-spots-panel.tsx가 재사용) 총 3곳 전부가 공유하므로, 한 번의
수정으로 세 화면 모두에서 "검색 결과 0건이어도 URL 직접 추가" 기능이 동일하게
동작한다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 142 파일 / 1670건 전체 통과.
  - `blog-curation-modal.test.tsx`(+1건, 신규 describe): 검색 결과 0건 상태에서
    "URL 직접 추가하기"로 URL을 넣고 체크 후 저장하면 실제로 그 URL이
    `blog_url_1`로 전송되는지, 추가 후 "찾지 못했습니다" 경고가 사라지는지
    검증.
  - 기존 "다른 URL로 바꾸기"(검색 결과 있는 경우 교체) 테스트와
    `event-blog-curation-modal`/`mobile-curation-workbench`/
    `category-mapping-panel`/`mom-pick-unmapped-spots-panel` 관련 테스트 전부
    회귀 없이 통과.
- `npm run build`: 성공.

## 특이 사항
- 저장되는 값은 여전히 "URL 텍스트 그 자체"뿐이다(본문 크롤링/미리보기는 시도하지
  않음) — 네이버 예약처럼 블로그 API 대상이 아닌 링크는 제목이 "(관리자가 직접
  입력한 URL)"로만 표시된다. 이는 기존 "다른 URL로 바꾸기"도 동일했던 동작이라
  이번에 새로 만든 제약이 아니다.
