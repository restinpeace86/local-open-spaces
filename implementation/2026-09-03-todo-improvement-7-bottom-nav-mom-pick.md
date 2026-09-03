# [개선사항 7] 하단 내비게이션 바 '맘스픽' 텍스트/아이콘 반영

## 구현 일시
2026-09-03

## 배경 조사
`BottomTabs`의 맨 왼쪽 슬롯은 원래 "추천픽"(/recommend, 카테고리+가격+거리 3조건 DB
필터 + AI TOP3 추천)이었는데, 화면 자체가 아직 없어(`ENABLE_RECOMMEND_TAB` 기본값
false) 항상 회색 비활성화 상태로만 노출되던 죽은 슬롯이었다. 그 사이 맘스픽(Decision
019, `/mom-pick` — 등급/게이미피케이션 커뮤니티)은 이미 완전히 구현·활성화됐지만,
grep으로 확인한 결과 하단 탭 어디에도 `/mom-pick` 진입 경로가 없었다(마이페이지/맘스픽
화면 자체 내부 링크만 존재).

## 구현 내용
- `src/components/nav/bottom-tabs.tsx`의 첫 번째 탭을 `{href:'/recommend', label:'추천픽',
  icon:'✨', flag: ENABLE_RECOMMEND_TAB}`에서 `{href:'/mom-pick', label:'맘스픽',
  icon:'👑'}`로 교체했다. 아이콘은 어드민 `TAB_LABEL`("👑 맘스픽 채택 관리")과 동일하게
  맞췄다(제5장 제4조 기존 구조 우선).
- 맘스픽은 이미 라이브 기능이라 더 이상 비활성화 플래그를 걸지 않는다 — 다른 활성 탭
  (스팟픽/이벤트픽)과 동일하게 클릭 시 바로 라우팅된다. 비로그인 사용자의 접근 정책은
  맘스픽 화면 자체의 게이팅 로직(`useMomPickAccess`)을 그대로 따른다(이 항목은 탭 라벨
  교체만 다루고, 게이팅 정책 변경은 개선사항 10의 범위다).
- `ENABLE_RECOMMEND_TAB` 플래그/"추천픽" 개념 자체는 향후 별도 스펙으로 다시 논의될 수
  있어 `feature-flags.ts`에서 삭제하지 않았다(제3장 제5조 추측 금지 — 탭 라벨 교체
  범위를 넘어선 결정은 하지 않음).

## 검증
`npx tsc --noEmit`/`npm run test`(96파일 973건, 신규 테스트 1건 포함)/`npm run build`
통과. dev 서버 `curl http://localhost:3000/`로 실제 렌더된 HTML에 "맘스픽" 텍스트가
있고 "추천픽"은 더 이상 없음을 확인.
