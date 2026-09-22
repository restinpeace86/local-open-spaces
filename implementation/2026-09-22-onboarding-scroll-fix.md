# [개선사항 4] PMS 온보딩 폼 스크롤 버그 수정

## 구현 대상
todo.md [개선사항 4]: 소셜 로그인 후 농장 정보 입력(온보딩) 화면에서 콘텐츠가
아래로 잘리고 스크롤이 안 돼 하단 버튼/입력창에 접근 불가.

## 원인
`src/app/layout.tsx`의 루트 `<body className="h-dvh flex flex-col
overflow-hidden">`가 원인이었다 — 이 앱은 body를 고정 높이+overflow-hidden으로
두고 각 화면이 자기 내부에서 스크롤하는 셸 구조다(예: `my-page-view.tsx`의
`flex-1 overflow-y-auto`). `src/app/partner/onboarding/page.tsx`는
`min-h-dvh`(최소 높이만 지정)를 쓰고 있어, 폼 콘텐츠가 고정 높이 body보다
길어지면 스크롤할 방법이 없었다.

## 변경 사항
- `src/app/partner/onboarding/page.tsx`: 루트 div를 `min-h-dvh` →
  `flex-1 flex flex-col overflow-y-auto`로 변경(my-page-view.tsx와 동일한
  기존 관례 재사용). 루트 레이아웃의 `overflow-hidden`은 앱 전체(다른 모든
  화면의 스크롤 동작)에 영향을 주므로 건드리지 않았다.
- `src/components/partner/onboarding-form.tsx`: 폼 하단에 안전 영역 패딩
  추가(`pb-[calc(env(safe-area-inset-bottom)+2rem)]`, `add-booking-fab.tsx`와
  동일한 기존 관례) — 스크롤 가능해진 뒤에도 등록 버튼이 기기 하단에 바짝
  붙지 않게.

## 검증
- `npx tsc --noEmit` / `npm run test`(197개 파일 2270개) / `npm run build`
  모두 통과.
- **실제 브라우저 검증**(Playwright, 세션 실주입 — 이 세션에서 이미 확립한
  방식): 파트너 행 없는 임시 계정으로 375×600(작은 화면, 오버플로우 강제)
  뷰포트에서 `/partner/onboarding` 접속 → 콘텐츠 높이 918px vs 뷰포트
  600px(실제로 넘침 확인) → 스크롤 컨테이너를 찾아 맨 아래로 스크롤 →
  `scrollTop`이 0→318로 실제 이동, "등록 완료" 버튼이 뷰포트 안에 들어와
  보임을 스크린샷으로 확인. 임시 계정은 검증 후 삭제.
