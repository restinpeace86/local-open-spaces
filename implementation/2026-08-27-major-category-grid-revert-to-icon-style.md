# [대분류 그리드를 아이콘 방식으로 원복]

## 구현 대상
직전 작업(`2026-08-27-category-accordion-and-province-section-removal.md`)에서 "각 대분류
영역 내에서 중분류가 펼쳐져야 한다"는 지적에 따라 아코디언 방식으로 바꿨으나, 대표가 실제
사용해보고 처음(아이콘 그리드 + 선택된 대분류의 중분류를 그리드 바로 아래 한 줄로 노출)
방식을 더 선호해 원복 요청.

## 구현 일시
2026-08-27

## 변경 사항
`src/components/home/major-category-grid.tsx`를 아코디언 이전 버전(커밋 `a604aeb`)으로
되돌렸다 — 7개 대분류 아이콘을 그리드로 배치하고, 선택된 대분류 하나의 중분류만 그리드
바로 아래에 칩 목록으로 노출한다. 컴포넌트의 props 인터페이스(`selectedMaj`/`onSelectMaj`/
`selectedMin`/`onSelectMin`)는 아코디언 버전과 동일하게 유지했으므로 `home-view.tsx`나
테스트 코드는 전혀 수정할 필요가 없었다(마크업만 원복).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 46 파일 497건 통과 — `major-category-grid.test.tsx`는 아코디언 전환 때도
  손대지 않았던 파일이라(텍스트/aria-pressed 검증만 해서 마크업 구조 변경과 무관) 이번
  원복에도 수정 없이 그대로 통과했다.
- `npm run build`: 성공.
