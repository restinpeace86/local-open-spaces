# 이벤트픽/스팟픽 AI 컨시어지 챗봇 버튼 제거

## 구현 대상
`todo.md` 개선사항 2 중 "현재 이벤트픽하고 스팟픽에 그 ai 컨시어지
챗봇있는거 버튼 제외해" 부분만 먼저 처리(나머지 큰 UX 개편은 범위가
커서 별도로 진행).

## 구현 일시
2026-10-20

## 변경 사항
- `src/components/home/home-view.tsx`(이벤트픽, `/`): `<AiChatFab
  center={center} />` 렌더링 및 관련 import 제거.
- `src/components/map/map-explorer.tsx`(스팟픽, `/nearby`): 동일하게
  `<AiChatFab center={center} />` 및 import 제거.
- `AiChatSheet`(챗봇 바텀시트)는 `AiChatFab` 내부에서만 렌더링되는
  구조라(`ai-chat-fab.tsx`: `{isOpen && <AiChatSheet .../>}`), FAB 하나만
  제거하면 버튼+시트 전체가 함께 빠진다 — 별도 조치 불필요.
- 맘스픽(`mom-pick-view.tsx`)은 todo.md에 "맘스픽은 일단 홀딩"이라고
  명시돼 있어 손대지 않았다(그 파일의 AiChatFab 관련 주석은 자체 FAB의
  "위치/톤 관례"만 참고하는 것이고, 실제로 AiChatFab을 마운트하진
  않는다 — 실측 확인).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(333 파일 3,332개) /
  `npm run build` 전부 통과.
- `home-view.test.tsx`/`map-explorer.test.tsx` 67개 테스트 통과(기존
  AiChatFab 관련 auth mock은 다른 테스트 목적과 무관하게 남아있어도
  무해함을 확인).

## 특이 사항
- `src/components/chat/ai-chat-fab.tsx`/`ai-chat-sheet.tsx`와 API 라우트
  (`/api/ai-chat/*`)는 삭제하지 않고 그대로 남겨뒀다 — 다른 화면에서
  재사용할 가능성이 있고, 사용자 지시는 "버튼 제외해"(화면에서 숨김)로
  한정됐지 기능 자체의 완전 폐기는 아니다.
