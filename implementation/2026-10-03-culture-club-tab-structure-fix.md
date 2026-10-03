# 문화센터 탭 구조 재수정 — 바텀시트 → 실제 탭

## 구현 대상
사용자 지시(2026-10-03): "확인해보니 뭔가 이벤트픽내에서 탭으로 분리된게
아니고 중분류영역 아래쪽에 버튼 있고 그거 누르면 바텀시트 되어있는걸로
되어있네.. 그렇게 말고 난 이벤트픽 화면에서 현재꺼에 대하여 탭으로
하나있고 문화센터로 탭하나 만들자는 얘기였는데..." — 오늘 먼저 구현한
"문화센터" 기능([[2026-10-03-culture-club-tab.md]])이 실제로는 버튼→
바텀시트 오버레이 구조였는데, 사용자가 원한 건 이벤트픽 화면 자체를
"이벤트"/"문화센터" 2개 탭으로 나누는 구조였다.

## 변경 사항
### 1. `src/components/home/culture-club-sheet.tsx` 삭제
`fixed inset-0` 오버레이/배경 클릭 닫기/X 버튼 전부 제거.

### 2. `src/components/home/culture-club-tab-view.tsx` 신규
기존 시트의 필터(브랜드 라벨/지점 단일선택/요일·카테고리 다중선택 OR)와
무한스크롤 로직은 그대로 유지하되, 모달 래퍼 없이 `flex-1 flex flex-col
overflow-hidden` 평범한 블록으로 바꿨다 — 탭 전환으로 이 컴포넌트 전체가
그 자리에 바로 렌더링된다.

### 3. `src/components/home/home-view.tsx`
- "🏫 문화센터 강좌 보러가기" 진입 버튼/카드 섹션 제거.
- `isCultureClubOpen` boolean state 제거, `activeMainTab: 'events' |
  'culture-club'` state로 교체.
- `HomeHeader` 바로 아래에 탭 바 추가 — (explore) 라우트의 `TopTabs`와
  동일한 밑줄 강조 비주얼(`border-b-2`, 활성 시 `border-blue-600 text-
  blue-600`)을 재사용했지만, 그건 Link 기반 라우트 이동이고 이건 같은
  페이지 안 상태 전환이라 버튼으로 새로 만들었다(제5장 제4조 — 비주얼은
  재사용, 메커니즘은 다르게).
- 기존 "이벤트" 탭의 전체 본문(검색 결과/대분류 그리드/히어로/슬라이더 등,
  한 글자도 안 바꿈)을 `activeMainTab === 'culture-club' ? <CultureClubTabView
  /> : (...)` 삼항식으로 감쌌다.

## 검증
- `src/components/home/home-view.test.tsx`에 "이벤트픽 메인 탭(이벤트/
  문화센터)" describe 블록 추가(3개): 기본값은 이벤트 탭(카테고리별 행사
  섹션 보임), 문화센터 탭 클릭 시 필터 UI가 보이고 기존 콘텐츠는 사라짐,
  다시 이벤트 탭으로 돌아오면 원래 화면 복원.
- `npx tsc --noEmit` / `npm run test`(261개 파일 2,726개) / `npm run build`
  전부 통과.

## 특이 사항
- 이마트 컬처클럽 실제 사이트(cultureclub.emart.com/enrolment)의 필터
  레이아웃을 참고해달라는 요청이 있었으나, 그 페이지는 클라이언트
  렌더링(React/SPA, AppSync GraphQL 직접 호출) 구조라 WebFetch로는 빈
  셸만 보여 실제 필터 UI를 확인할 수 없었다 — 스크린샷이나 직접 설명을
  받아야 레이아웃을 맞출 수 있다(사용자에게 안내함, 이번 커밋 범위 밖).
