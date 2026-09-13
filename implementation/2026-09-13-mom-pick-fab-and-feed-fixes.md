# 맘스픽 글쓰기 FAB화 + 등업 상태 버그 수정 + 인기글 기준/카드 컴팩트화

## 구현 대상
사용자 지시(2026-09-13):
> 글쓰기는 맨 상단 말고 floating으로 해서 우측하단에 글쓰기 버튼으로 만들어주던가해...
> 그리고 글하나 썼고 새싹맘 됐는데 글쓰기 버튼이나 다른 전체보기 등 누르면 아직
> 새싹맘 등급이 아니에요 첫글 쓰러가기 나옴.
> 그리고 쓴 글이 실시간 라이브라던가 인기 우수글에 바로 뜨는데.. 인기 우수글은
> 무슨 기준으로 바로 뜨는거지? .. 방금올린글이 인기 우수글에 보이는건 아닌거
> 같아.. 그리고 글 한개가 차지하는 공간이 너무 커.. 사진은 사진 보기 버튼으로
> 대체하고 그거 누르면 올린 사진들 팝업으로 확인가능하게 하던가하고.. 용인어린이
> 상상의숲 제목 올렸으면 그 라인 우측에 하린 맘과 등급이 보이던가.. tag들도..
> 너무 많네

## 구현 일시
2026-09-13

## 1. 글쓰기 버튼 → 우측 하단 플로팅(FAB)
`mom-pick-view.tsx` 상단에 있던 "✍️ 글쓰기" 버튼을 다른 화면(스팟픽/이벤트픽)의
AI 챗봇 FAB(`ai-chat-fab.tsx`)와 동일한 위치/톤으로 옮겼다:
```tsx
<button aria-label="글쓰기"
  className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center
             rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-2xl
             text-white shadow-lg ... md:bottom-6">
  ✍️
</button>
```
`bottom-20`(모바일, 하단 탭 위)/`md:bottom-6`(데스크톱)은 기존 FAB 관례를
그대로 재사용했다(제5장 제4조).

## 2. 버그 수정 — 등업 직후에도 계속 "새싹맘 아니에요" 안내가 뜨던 문제
**원인**: `useMomPickAccess()`가 `user`(로그인 세션)가 바뀔 때만 프로필을
재조회해 `state`(guest/not_sprout_yet/allowed)를 계산한다. 첫 글 작성 시 DB
트리거(`promote_to_sprout_on_first_post`)가 `grade`를 signed_up→sprout로
승급시키지만, 같은 세션에서는 `user` 자체가 바뀌지 않아 이 훅이 재조회하지
않고 예전 `state`(not_sprout_yet)에 계속 머물러 있었다 — `mom-pick-view.tsx`가
글 등록 후 자기 로컬 `profile` state만 갱신(`refreshProfileAfterPost`)했지,
게이팅을 판단하는 훅 내부 상태는 그대로였다.

**수정**: `useMomPickAccess(refreshKey?)`로 옵션 인자를 추가하고 `useEffect`
deps에 포함시켰다. `mom-pick-view.tsx`가 `accessRefreshKey` state를 두고
`refreshProfileAfterPost()`에서 함께 증가시켜, 글 등록 직후 이 훅이 강제로
재조회하도록 했다.

## 3. "인기 · 우수글"에 방금 쓴 글이 바로 뜨던 문제
**원인**: `getTrendingPosts()`가 `like_count DESC, created_at DESC`로만
정렬했다. 좋아요가 전부 0(동률)일 때 사실상 2차 정렬(최신순)이 순위를
결정해, 좋아요가 하나도 없는 방금 쓴 글도 상위에 노출됐다.

**수정**: `.gt('like_count', 0)` 조건을 추가해 좋아요가 1개 이상인 글만
"인기"로 취급한다. 댓글 집계·주간 가중치 등은 이 앱에 댓글 기능 자체가 없고
(정직한 데이터 한계, 기존 주석에도 명시) 지금 표본이 1건뿐이라 판단 근거가
부족해 이번엔 손대지 않았다(제3장 제5조 추측 금지) — 필요해지면 별도로
설계·확인 후 진행.

## 4. 게시글 카드 컴팩트화(`dashboard-post-card.tsx`)
- **제목 줄에 작성자 통합**: 스팟명(제목)과 작성자 닉네임/등급을 한 줄에
  배치(`justify-between`)해 기존에 따로 있던 줄 하나를 없앴다.
- **태그 최대 3개 + "+N개"**: survey_review의 설문 뱃지(연령대/방문환경/
  체류시간/만족포인트)와 checklist의 체크 항목을 각각 하나의 목록으로 모아
  최대 3개까지만 보여주고, 나머지는 회색 "+N개" 뱃지로 요약한다.
- **사진 → 버튼 + 팝업**: 인라인 `<img>` 썸네일을 없애고 "📷 사진 N장 보기"
  버튼으로 대체했다. 누르면 새 컴포넌트 `PostPhotoModal`(전체 화면 오버레이,
  좌우 화살표로 여러 장 넘겨보기 — `detail-modal.tsx`의 이벤트 이미지
  슬라이드와 동일한 관례)이 뜬다.
- micro_review 자유글에도 `line-clamp-2`를 적용해 긴 글이 카드를 늘리지
  않게 했다(survey_review는 기존에도 이미 적용돼 있었음).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 137 파일 / 1636건 전체 통과.
  - `use-mom-pick-access.test.ts`: refreshKey가 바뀌면 user가 그대로여도
    프로필을 다시 조회해 state가 갱신되는지 검증하는 테스트 추가(1건).
  - `mom-pick-view.test.tsx`: 버튼 쿼리를 텍스트("✍️ 글쓰기")에서
    `aria-label="글쓰기"` 기준으로 전환(FAB가 아이콘만 보여주므로).
  - `dashboard-post-card.test.tsx`: 제목 줄 작성자 표시, 태그 3개+overflow,
    사진 버튼/팝업 열고 닫기, 사진 없을 때 버튼 없음, is_adopted 표시 등을
    검증하도록 전면 갱신.
- `npm run build`: 성공.

## 특이 사항
- "인기 우수글"에 "주간 집계"/댓글 반영을 도입하는 것과, 게시글 본문+태그+사진을
  전부 하나의 "상세 보기" 팝업으로 통합하는 것(사용자가 "~라던가?"로 제안만 하고
  확정하지 않은 두 가지)은 이번 범위에 포함하지 않았다 — 명확히 확정된 요구
  (FAB 위치, 등업 버그, 인기글 최소 기준, 사진 버튼화, 제목줄 통합, 태그 개수
  축소)만 구현했다. 필요하면 다음에 구체적으로 확인 후 진행.
