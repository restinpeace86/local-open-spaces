# 인앱 길찾기 경로거리 배지 위치를 상단으로 변경

## 구현 대상
사용자 지시(2026-09-25): 직전 커밋(safe-area-inset-bottom 보정)에 이어
"그냥 상단에 좀 올려놔줘" — 하단 안전영역 보정 대신 아예 배지를 지도 상단으로
옮겨달라는 요청.

## 변경 사항
`src/components/map/map-preview-modal.tsx`: 길찾기 액션 컨테이너를
`absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]`에서
`absolute top-[calc(env(safe-area-inset-top)+3.5rem)]`로 옮겼다.
`top-3 right-3`에 있는 "지도 닫기"(✕) 버튼(w-8 h-8)과 겹치지 않도록 그
아래(top-14 상당)에 배치했고, 상단 노치/다이나믹 아일랜드 대비
`safe-area-inset-top`도 하단과 동일한 원칙으로 함께 더했다.

## 검증
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,328개, 기존
  `map-preview-modal.test.tsx` 5건 그대로 통과) / `npm run build` 모두 통과.
