# [대분류 아코디언 전환 + 경기도권 기타 섹션 제거]

## 구현 대상
1. 대분류/중분류 드릴다운(직전 작업)에서, 선택된 대분류 하나의 중분류만 그리드 맨 아래에
   한 줄로 붙던 방식이 "중분류가 어느 대분류 소속인지" 시각적으로 불분명하다는 피드백 —
   각 대분류 자신의 영역 안에서 중분류가 펼쳐지도록 아코디언 방식으로 전환.
2. 홈(이벤트픽) 화면 맨 아래 "🗺️ 경기도권 기타" 섹션 완전 제거.

## 구현 일시
2026-08-27

## 1. 대분류 아코디언 전환 (`src/components/home/major-category-grid.tsx`)
기존 "7개 아이콘 그리드 + 선택된 대분류 하나의 중분류를 그리드 아래 한 줄로" 구조를
"대분류 하나하나가 자신만의 행(카드)이고, 그 대분류를 누르면 정확히 그 행 바로 아래에
자신의 중분류 칩이 펼쳐지는" 아코디언 구조로 재작성했다. 한 번에 하나의 대분류만 펼쳐진다
(여러 대분류가 동시에 펼쳐지면 "지금 보는 칩이 어느 대분류 소속인지" 다시 헷갈리기 때문).
`onSelectMaj`/`onSelectMin` 콜백 인터페이스와 `home-view.tsx`의 상태 관리(2026-08-27 직전
작업에서 도입한 `selectedMaj`/`useCategoryFeed.reset()`)는 그대로 재사용했다 — 컴포넌트
내부 마크업만 바뀌었다.

## 2. "경기도권 기타" 섹션 제거
- `src/components/home/home-view.tsx`: `useProvinceWideEvents` 훅, `useInView` import/사용,
  관련 `useEffect`, JSX 섹션 전체 삭제.
- `src/lib/home/get-home-feed.ts`: 소비처가 없어진 `getProvinceWideEvents` 함수 삭제.
- `src/app/api/home/province-feed/route.ts`: 파일 및 디렉터리 삭제(이 화면이 유일한 소비처
  였음을 실측 확인 후 제거 — 죽은 라우트를 남기지 않음).

## 검증
- `npx tsc --noEmit`: clean(삭제된 라우트를 참조하던 Next.js 생성 타입 캐시(`.next/`)가
  일시적으로 낡은 에러를 냈으나, `.next` 삭제 후 재확인해 실제 소스 코드 문제가 아님을
  확인했다).
- `npm run test`: 46 파일 497건 통과(회귀 없음 — 인터페이스가 동일해 기존 22건의
  `major-category-grid.test.tsx`/`home-view.test.tsx`가 마크업 변경과 무관하게 그대로 통과).
- `npm run build`: 성공, 라우트 목록에서 `/api/home/province-feed` 사라짐을 확인.
- `npm run dev` 로컬 서버 실측: 페이지에 "경기도권 기타" 텍스트 0건, `/api/home/province-feed`
  요청 시 404 확인.
