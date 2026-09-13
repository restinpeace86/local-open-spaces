# 큐레이션 워크벤치 — 블로그 참고 섹션을 노출 중분류 섹션보다 앞으로

## 구현 대상
사용자 지시(2026-09-13):
> 음 그런데.. 이거 블로그 큐레이션이 위에 있고 뱃지 다는게 아래있는건 안되나?
> 그리고 노출중분류 먼저 지정 저장한후에.. 블로그 큐레이션으로 불러와야
> 키워드가 매핑되어서 노란색 포인트 주는데...

## 구현 일시
2026-09-13

## 확인한 사실 — "저장까지 해야 매핑된다"는 전제는 사실이 아님
`MobileCurationWorkbench`(`category-mapping-panel.tsx`와 신규
`mom-pick-unmapped-spots-panel.tsx`가 공유)의 하이라이팅 배선을 코드로
추적했다:
- `useSpotCurationForm`의 `curationCategoryId`는 `serviceCategoryId`(노출
  중분류 드롭다운의 **현재 선택값** — `useState`로 관리되는 메모리상 값이지,
  저장(DB 반영) 여부와 무관)로부터 매 렌더 다시 계산된다
  (`activeExposureCategoryName` → `resolveCurationCategoryId(...)`).
- `BlogReferenceViewer`의 `highlight(text)` 함수도 `useMemo` 없이 매 렌더
  순수하게 `highlightKeywords(text, curationCategoryId, ...)`를 호출한다.

즉 관리자가 드롭다운에서 노출 중분류를 **선택만** 해도(저장 버튼을 누르기
전이라도) 다음 렌더에서 이미 화면에 떠 있는 블로그 본문이 즉시 그 카테고리
키워드로 노란색 하이라이트된다 — "저장 후 다시 불러와야" 하는 게 아니다.
그래서 두 섹션의 화면상 순서를 바꿔도 하이라이팅 동작 자체는 전혀 영향받지
않는다는 것을 코드 근거로 확인한 뒤 진행했다(제3장 제5조 추측 금지 —
"순서를 바꾸면 하이라이팅이 깨질 것"이라고 짐작하지 않고 실제 배선을 먼저
확인).

## 변경 사항
`mobile-curation-workbench.tsx`에서 두 섹션의 JSX 순서와 번호를 바꿨다:
- 기존: "2. 노출 중분류 & 편의시설 뱃지" → "3. 블로그 참고".
- 변경: "1. 블로그 참고 (URL만 저장, 본문은 저장 안 함)" → "2. 노출 중분류 &
  편의시설 뱃지".

이 컴포넌트는 `category-mapping-panel.tsx`의 RowPicker와 신규
`mom-pick-unmapped-spots-panel.tsx`(Step 145) 둘 다에서 그대로 재사용되므로,
한 곳만 고치면 두 화면 모두에 동일하게 반영된다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 142 파일 / 1669건 전체 통과.
  - `mobile-curation-workbench.test.tsx`(+1건): 블로그 참고 섹션 제목이
    노출 중분류 섹션 제목보다 DOM상 먼저 오는지(`compareDocumentPosition`)
    검증. 기존 10건은 헤딩 텍스트("2. 노출 중분류 & 편의시설 뱃지")가
    그대로 유지돼(번호만 유지, 위치만 이동) 수정 없이 통과.
  - `category-mapping-panel.test.tsx`/`mom-pick-unmapped-spots-panel.test.tsx`:
    워크벤치를 재사용하는 두 소비처 모두 회귀 없이 통과.
- `npm run build`: 성공.

## 특이 사항
- 하이라이팅 자체의 동작 방식(저장 불필요, 실시간 반영)은 이번에 새로 만든
  게 아니라 원래부터 그랬던 기존 로직이다 — 이번 작업은 "그 사실을 코드로
  확인하고, 사용자가 오해하고 있던 전제(저장 필요)를 바로잡은 뒤 순서만
  안전하게 바꾼 것"이다.
