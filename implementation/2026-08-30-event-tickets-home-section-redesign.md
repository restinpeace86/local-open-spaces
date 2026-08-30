# [홈 화면 할인 티켓(event_tickets) 섹션 UI 개편]

## 요구사항
1. 섹션 헤더를 "🔥 이번 주말 놓치면 후회할 특가"로, 우측에 "전체보기 ›" 텍스트 버튼
   추가(전체 리스트 연결 준비).
2. 최신 활성 티켓 중 4개만 노출, 카드를 메인 Hero와 동일 규격(h-[320px], 다크
   그라데이션 오버레이, 좌상단 할인율 뱃지, 하단 장소/상품명/가격/예매 버튼)의 배너
   카드로 교체. 클릭 시 기존과 동일하게 상세 모달이 열리도록 유지.

## 구현 일시
2026-08-30

## 1. 새 배너 카드 (`src/components/cards/event-ticket-banner-card.tsx`)

지시서가 정확한 Tailwind 클래스를 직접 지정해(`relative overflow-hidden rounded-2xl
shadow-md h-[320px] flex flex-col justify-end bg-gray-900`, `bg-gradient-to-t
from-black/90 via-black/40 to-transparent`) 그대로 반영했다. 카드 전체가 하나의
`<button>`이라 카드를 클릭하든 카드 안의 "예매하기 ›" 표시(장식용 `<span>`, 중첩
버튼 아님 — HTML에서 button 안에 button은 유효하지 않음)를 클릭하든 동일하게
`onSelect`가 호출돼 상세 모달이 열린다(지시서: "기존처럼... 유지" — 실제 booking_url
새 창 열기는 원래대로 상세 모달 안의 버튼이 담당, 이 배너 카드 단계에서 곧장 새 창을
열지 않음).

기존 그리드형 `EventTicketCard`(이전 지시서에서 이미 만든 컴포넌트)는 그대로 두고
건드리지 않았다 — 이 카드는 "전체보기" 리스트에서 공간 효율을 위해 계속 쓰인다(아래
2번 참고). 두 카드는 목적이 달라 하나로 통합하지 않았다(제5장 제4조 기존 구조
우선의 취지는 "동일 목적 중복 방지"이지 "다른 목적을 억지로 통합"이 아니라고 판단).

## 2. "전체보기 ›" 바텀시트 (`src/components/home/event-ticket-browse-sheet.tsx`)

기존 `EventBrowseSheet`(이벤트픽 전체보기)와 동일한 관례(배경 클릭/X로 닫힘, 더 보기
페이지네이션, 이미 있는 `GET /api/event-tickets`의 `page`/`page_size` 그대로 재사용)를
따르는 새 바텀시트를 만들었다. event_tickets에는 `category_maj` 같은 표준 대분류
체계가 없어 필터 칩은 넣지 않았다(지시서에 없는 필터 UI를 임의로 추가하지 않음, 제7장
제4조). 이 시트 안에서는 한 화면에 더 많이 보여주는 게 중요해 기존 그리드형
`EventTicketCard`를 그대로 쓴다(행사 기간까지 노출).

## 3. `home-view.tsx` 연동

- 섹션 헤더를 `flex items-center justify-between`로 바꿔 타이틀과 "전체보기 ›" 버튼을
  나란히 배치.
- `eventTickets.slice(0, 4)`로 홈 섹션 노출을 4개로 제한(전체 개수는 시트에서 확인).
- `isEventTicketBrowseOpen` 상태 신설 — 시트에서 카드를 선택하면 기존
  `EventBrowseSheet`+`DetailModal` 패턴과 동일하게 시트를 닫고 곧바로 상세 모달을 연다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(67파일 691건 — 홈 섹션 타이틀/배너 카드 내용/4개 제한/전체보기 시트
  플로우 신규 테스트 포함) 통과.
- `npm run build` 통과.

### 실측 검증
로컬 개발 서버 + 시드된 실제 `event_tickets` 데이터로 `GET /api/event-tickets` 및
홈 페이지 SSR 응답에 새 섹션 타이틀 "🔥 이번 주말 놓치면 후회할 특가"이 정상 포함됨을
확인했다. 이 세션에는 브라우저 자동화 도구가 없어 실제 화면을 시각적으로 캡처해
확인하지는 못했다 — 대신 컴포넌트 단위 테스트(27건, 정확한 렌더 텍스트/클래스/클릭
플로우 검증)와 API 레벨 실측으로 대체 검증했다.

## 특이 사항
- 배너 카드는 지시서 스펙대로 장소명/상품명/가격/예매 버튼만 보여주고 행사 기간은
  표시하지 않는다(지시서 원문에 배너 카드 항목으로 명시되지 않음) — 행사 기간은
  "전체보기" 시트의 그리드 카드에서는 계속 보인다.
