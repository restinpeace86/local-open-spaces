# [개선사항 8] 비로그인 사용자 챗봇 사용 횟수 제한 UX 개선 (선 진입 차단)

## 구현 일시
2026-09-03

## 배경 조사
`AiChatSheet`는 마운트 즉시(`useEffect(..., [])`) 날씨 질문부터 인터뷰를 시작하고,
무료 체험 소진 여부(`hasConsumedAnonymousFreeUse`, localStorage)는 8단계 인터뷰를 전부
마친 `handleVibeConfirm`(최종 검색 직전) 시점에만 확인했다 — 사용자가 타이핑을 다
마친 뒤에야 막혀 허탈감을 준다는 지적과 정확히 일치했다(실측 코드 확인).

같은 조사 중, 마운트 `useEffect`가 `deps: []`(1회 실행)인데 `user`(useUser() 훅,
`supabase.auth.getUser()`의 비동기 응답을 기다림)를 참조하고 있어, 이 효과가 실행되는
"최초 렌더" 시점에는 실제 로그인 여부와 무관하게 `user`가 항상 `null`이었던(아직
비동기 응답 전) 잠재 버그도 함께 발견했다 — 그대로 두면 이번 개선사항으로 추가하는
"비로그인+소진 시 즉시 차단" 로직이 실제로는 로그인된 사용자까지 오탐으로 차단할
위험이 있어(과거 비로그인으로 챗봇을 써서 localStorage 플래그가 이미 세팅된 뒤 로그인한
사용자 시나리오), 이번 수정에서 함께 바로잡았다.

## 구현 내용
- `useUser()`에서 `isLoading`도 함께 받아온다(`isUserLoading`).
- 마운트 시 인터뷰를 시작하던 `useEffect`를 `hasInitializedRef`로 감싸 `isUserLoading`이
  풀린 뒤 딱 한 번만 실행되도록 했다(auth 상태가 확정된 뒤에만 로그인 여부를 판단).
- 그 시점에 `!user && hasConsumedAnonymousFreeUse()`이면 날씨 질문을 아예 시작하지 않고
  곧바로 기존 `LIMIT_REACHED` 화면(로그인 유도 CTA, "로그인하러 가기" 버튼)을 띄운다.
  `LIMIT_REACHED` phase는 이미 `ChipOptions`(질문 선택지) 렌더링에서 제외돼 있어
  (기존 코드) 차단된 사용자는 어떤 질문에도 답할 수 없다 — 새 UI를 만들지 않고 기존
  화면/문구를 재사용했다(제5장 제4조 기존 구조 우선).
- `handleVibeConfirm`의 기존 동일 검사(최종 검색 직전)는 그대로 남겨둔다 — 다른 탭에서
  방금 무료 체험을 소진했을 수 있는 경우를 위한 이중 방어.

## 검증
`npx tsc --noEmit`/`npm run test`(96파일 973건, 기존 그대로 — `ai-chat-sheet.tsx`는
이 세션 이전부터 단위 테스트가 없는 대형 상태 컴포넌트라 기존 관례를 따라 신규 테스트는
추가하지 않음)/`npm run build` 통과.

**주의(정직한 한계 고지)**: 이 환경에는 브라우저 자동화 도구가 없어 localStorage
소진 상태를 실제로 만들어 놓고 챗봇을 여는 인터랙티브 시나리오까지는 직접 클릭으로
재현·확인하지 못했다. dev 서버가 정상 기동/렌더되는 것과 FAB 진입점이 그대로
노출되는 것(SSR 크래시 없음)은 curl로 확인했고, 로직 자체는 기존에 검증된
`hasConsumedAnonymousFreeUse`/`LIMIT_REACHED` phase 배선을 그대로 재사용해 코드
추적으로 정확성을 확인했다.
