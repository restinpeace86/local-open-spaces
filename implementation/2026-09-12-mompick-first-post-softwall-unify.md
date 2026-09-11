# 맘스픽 첫 글쓰기 소프트월 통일 (Step 121)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
> "맘스픽 여전히 들어가면 장소선택이 같이보여... 맘스픽영역하고.. 일단 내가 현재
> 로그인은 했지만 첫글은 안쓴상태인데 이상태면 맘스픽 내용만 보여야돼 첫글쓰기의
> 장소선택이 보이면안돼... 여기서 뭔가 눌러서 보려는 액션을 하면 그때 팝업이 떠서
> 권한이 없다고 하면서 첫글 쓰러 가자고 해야해... 그때 글쓰기의 첫번째인 장소선택이
> 보여야하는거고..."

## 원인
`MomPickView`는 `state`(`guest`/`not_sprout_yet`/`allowed`)에 따라 글쓰기 영역을
다르게 렌더링했는데, 실제로는 `guest`만 소프트월(클릭 전엔 실제 폼을 렌더하지 않는
버튼)이었고, `not_sprout_yet`(로그인은 했지만 첫 글을 아직 안 쓴 상태)은 실제 글쓰기
폼(`SurveyReviewComposer`, 1단계가 장소선택)을 **항상 그대로 렌더링**하고 있었다
(2026-09-02/09-04 당시엔 의도된 설계였음 — `SaessakMomGuideModal`의 "첫 글 쓰러
가기"는 이미 떠 있는 폼으로 스크롤만 했다). 사용자가 이번에 이 설계 자체를
"guest와 동일하게 클릭 전까진 폼을 보여주지 말라"로 바꿔달라고 요청.

## 변경 사항
- `src/components/community/mom-pick-view.tsx`:
  - 신규 상태 `isComposerRevealed`(기본 `false`). `not_sprout_yet && !isComposerRevealed`일
    때는 `SurveyReviewComposer` 대신 guest와 동일한 스타일의 소프트월 버튼
    ("✍️ 첫 글 쓰고 맘스픽 시작하기")을 보여준다 — 누르면 `SaessakMomGuideModal`이
    뜬다(피드 영역의 투명 인터셉트 레이어를 눌렀을 때와 같은 모달, 같은 트리거
    상태 `isGuideModalOpen` 재사용).
  - `SaessakMomGuideModal`의 `onWriteClick` 핸들러: 기존엔 "이미 떠 있는 폼으로
    스크롤"만 했지만, 이제는 `setIsComposerRevealed(true)`로 폼을 먼저 드러낸
    뒤 스크롤한다(`scrollIntoView`가 없는 테스트 환경 등을 대비해 존재 여부를
    방어적으로 확인).
  - `state === 'allowed'`(이미 새싹맘 이상)는 기존과 동일하게 폼이 항상 바로
    렌더된다 — 변경 없음(사용자가 문제 삼은 것은 오직 `not_sprout_yet`이었음).
- `src/components/community/saessak-mom-guide-modal.tsx`: 파일 상단 주석을
  새 동작(모달을 거쳐야만 폼이 렌더된다)에 맞게 갱신.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1562 tests 전체 통과. `mom-pick-view.test.tsx`:
  - 기존 "글쓰기 폼은 레이어 밖에 있어 그대로 렌더된다" 테스트를 새 기대값으로
    교체 — 진입 시 폼(`composer` testid)이 렌더되지 않고 소프트월 버튼만 보임.
  - 신규: 소프트월 버튼을 누르면 "🌱 아직 새싹맘 등급이 아니에요!" 안내 팝업이
    뜨고 폼은 여전히 렌더되지 않음.
  - 신규: 팝업의 "첫 글 쓰러 가기"를 눌러야 비로소 폼이 나타나고 팝업은 닫힘.
  - 기존 "피드 위 투명 레이어를 터치하면 안내 팝업이 뜬다"/"allowed는 인터셉트
    레이어가 없다"/guest 관련 테스트는 그대로 통과(회귀 없음).
- `npm run build`: 성공(라우트 목록 변화 없음).

## 특이 사항
- `isComposerRevealed`는 세션(마운트) 로컬 상태다 — 페이지를 벗어났다 다시 들어오면
  다시 소프트월부터 시작한다(guest의 `isGuestWritePromptOpen`과 동일한 관례,
  DB에 저장할 만한 값이 아님).
- 실제 글 등록 후 `promote_to_sprout_on_first_post` DB 트리거로 승급되면
  `state`가 `allowed`로 바뀌어 이 소프트월 분기 자체를 더 이상 타지 않는다
  (기존 자동 승급 흐름 그대로 유지, 변경 없음).
