# 맘스픽 메인 화면 투명 오버레이 온보딩 패턴 — 개선사항4 / Step 96

## 구현 대상
`implementation/todo.md` 개선사항4: 맘스픽에서 첫 글 미작성 유저(로그인 O,
`not_sprout_yet`) 온보딩을 "화면을 아예 숨기지 않고, 메인 화면을 보여주면서
유도"하는 방식으로 개선.
1. 배경 화면(피드) 노출 유지
2. 투명 인터셉트 레이어 — 배경은 보이되 터치는 이 레이어가 가로챔
3. 터치 시 안내 팝업 → [첫 글 쓰기 화면]으로 유도

## 구현 일시
2026-09-10

## 사전 확인
- Decision 019.2("맘스픽 커뮤니티 피드는 로그인 사용자만 이용 가능")와 상충하지
  않음 — 오히려 기여-게이팅 방향에 부합.
- 이전 todo.md 개선사항8(2026-09-04, "등급 미달성 유저도 스팟 목록을 스크롤하며
  둘러보는 것은 자유롭게 허용")의 not_sprout_yet 자유 열람 부분을, 같은 사용자가
  이 개선사항4로 갱신(프리뷰는 보되 터치는 인터셉트). 같은 문서(todo.md) 상의
  최신 지시라 상충이 아닌 방침 갱신으로 처리.

## 변경 사항
### `src/components/community/mom-pick-view.tsx`
- 진입 즉시 `SaessakMomGuideModal`을 자동으로 띄우던 useEffect 제거 — 이제
  not_sprout_yet에서도 피드가 배경 프리뷰로 먼저 보인다. (state가 not_sprout_yet이
  아니게 되면 열려 있던 모달만 닫는다.)
- 피드 블록(`PreviewSection` 3개)을 `relative` 컨테이너로 감싸고, state가
  `not_sprout_yet`일 때 그 위에 `absolute inset-0 z-10`의 **투명 버튼**을 덮는다
  — 피드 콘텐츠/링크 터치를 가로채 `setIsGuideModalOpen(true)`로 안내 팝업을
  띄운다. 팝업의 "첫 글 쓰러 가기"는 기존대로 글쓰기 폼으로 스크롤한다.
- 글쓰기 폼(`SurveyReviewComposer`)은 이 레이어 밖(위쪽)에 있어 그대로 사용 가능.
- `guest`/`allowed` state는 인터셉트 레이어 없음(기존 동작 유지).

### `src/components/community/mom-pick-view.test.tsx` (신규)
- +4건: 진입 시 모달 자동 노출 안 됨 + 피드 프리뷰 노출 / 투명 레이어 터치 시
  안내 팝업 / 글쓰기 폼은 레이어 밖 / allowed에는 레이어 없음.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 123 파일 1432건 통과(직전 1428 → +4).
- `npm run build`: Compiled successfully.

## 특이 사항
- "안내 팝업과 함께 (또는 즉시) [첫 글 쓰기 화면]으로 이동" — 이 앱은 별도 /write
  라우트가 없고 글쓰기 폼이 같은 화면 상단에 항상 있으므로(Decision 020,
  SaessakMomGuideModal 주석), 안내 팝업 → "첫 글 쓰러 가기" → 폼으로 스크롤이
  "첫 글 쓰기 화면 이동"에 해당한다(제5장 제4조 기존 구조 재사용).
