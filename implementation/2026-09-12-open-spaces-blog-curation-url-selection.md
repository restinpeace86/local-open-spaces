# open_spaces 블로그 큐레이션도 events처럼 URL 선택 저장

## 구현 대상
사용자 지시: "관리자 화면에서 open_spaces쪽에 블로그 큐레이션도 가져온 블로그
url에 대하여 선택하여 저장할 수 있게해줘.. events 탭처럼"

## 구현 일시
2026-09-12

## 조사 — 기존 동작과 events 탭의 차이
- **events 탭**(`EventBlogCurationModal`): 검색 결과 각각에 체크박스가 있어,
  관리자가 고른 것만(최대 3개, 체크 순서 유지) `events.curated_blog_urls`에
  저장한다.
- **open_spaces 탭**(`BlogCurationModal`/`MobileCurationWorkbench`,
  `useSpotCurationForm` 공유): 체크박스가 아예 없었다 — 저장 시
  `blogItems[0]/[1]/[2]`(검색된 상위 3개)를 관리자 확인 없이 그대로
  `spot_curations.blog_url_1/2/3`에 저장했다. 관련 없는 결과가 섞여도
  "다른 URL로 바꾸기"로 한 슬롯씩 수동 교체하는 것 말고는 걸러낼 방법이 없었다.

`/api/spot-blog-reviews/route.ts`(유저 화면 "블로그 후기" 조회) 확인 결과,
`spot_curations.blog_url_1/2/3`은 이미 유저 화면에서 최우선으로 쓰이고 있었다
(관리자 큐레이션 → 신선한 캐시 → 재조회 순 폴백) — 즉 DB 스키마/유저 노출 경로는
이미 events와 동일한 구조였고, **빠진 건 관리자 화면의 "선택" UI뿐**이었다.
(DB 마이그레이션 불필요.)

## 변경 사항

### 1. `src/lib/admin/use-spot-curation-form.ts`
- `selectedUrls: string[]` state 추가(기본값 `[]` — events와 동일하게 아무것도
  미리 선택돼 있지 않음, 관리자가 명시적으로 골라야 함).
- `toggleUrl(url)`: 이미 선택된 URL은 해제, 미선택인데 3개 다 찼으면 무시
  (events의 `toggleUrl`과 동일 로직).
- 기존 큐레이션 조회 시 `[blog_url_1, blog_url_2, blog_url_3].filter(...)`로
  `selectedUrls`를 프리필한다(재편집 시 이미 저장된 URL이 체크된 채로 보임).
- `save()`의 payload를 `blogItems[0..2].link` 대신 `selectedUrls[0..2]`로 변경.

### 2. `src/components/admin/blog-curation-modal.tsx` / `mobile-curation-workbench.tsx`
두 곳 다 `<BlogReferenceViewer>` 바로 다음에 체크박스 목록을 추가했다
(`EventBlogCurationModal`과 완전히 동일한 마크업):
```tsx
<p className="text-xs font-semibold text-gray-500">유저 화면에 노출할 블로그 선택 (최대 3개)</p>
{form.blogItems.map((item, i) => (
  <label>
    <input type="checkbox" checked={form.selectedUrls.includes(item.link)}
           disabled={!checked && form.selectedUrls.length >= 3}
           onChange={() => form.toggleUrl(item.link)} />
    블로그 {i+1} · {item.title}
  </label>
))}
```
두 컴포넌트 다 같은 훅(`useSpotCurationForm`)을 공유하므로 로직 변경 없이
UI만 추가하면 됐다(제5장 제4조 기존 구조 우선).

## 동작 변화(중요)
저장 버튼을 눌러도 **아무것도 체크하지 않았으면 이제 아무 URL도 저장되지
않는다**(이전엔 검색된 상위 3개를 항상 자동 저장했음). 이는 events 탭과 정확히
같은 동작으로 맞춘 의도된 변경이다 — "선택하여 저장"이라는 요청 자체가 "관리자
확인 없이 자동 저장"을 걷어내 달라는 의미이기 때문이다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 137 파일 / 1627건 전체 통과.
  - `blog-curation-modal.test.tsx`: 기존 2건(자동저장 가정 테스트) 체크박스
    클릭을 추가해 새 동작에 맞게 수정 + 신규 4건("아무것도 체크 안 하면 전부
    null", "하나만 체크하면 그것만 blog_url_1", "기존 저장된 URL 프리필",
    "최대 3개 제한").
  - `mobile-curation-workbench.test.tsx`: 신규 1건(체크박스로 고른 URL만 저장).
- `npm run build`: 성공.

## 특이 사항
- DB 스키마는 그대로다(`blog_url_1/2/3` 3개 슬롯 컬럼, events의
  `curated_blog_urls text[]`와 모양은 다르지만 이미 존재하던 구조를 그대로
  재사용 — 마이그레이션 없이 UI/저장 로직만 events와 동등하게 맞췄다).
- "다른 URL로 바꾸기"(수동 URL 교체)로 링크를 바꾸면 그 블로그 항목의 체크
  상태는 유지되지 않는다(바뀐 새 URL은 미체크로 보임, 옛 URL은 목록엔 안
  보이지만 `selectedUrls`에 남아있을 수 있음) — events의 `overrideActiveUrl`도
  동일한 한계가 있어 일부러 다르게 고치지 않고 그대로 맞췄다(제5장 제4조 —
  선택한 기준 화면과 다르게 동작하지 않도록).
