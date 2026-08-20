import type { Locator, Page } from '@playwright/test';

type Scope = Page | Locator;

// implementation/todo.md: QuickFilters/RadiusSelector/ItemListPanel은 데스크톱(aside)과 모바일(플로팅/바텀시트)에
// 동시에 두 벌씩 마운트되고 반응형 breakpoint에 따라 한쪽만 CSS로 숨겨진다(spec/common/responsive.md).
// 텍스트만으로 조회하면 항상 2개가 매칭되어 strict mode 오류가 나므로, 현재 뷰포트에서 실제로 보이는 요소만 좁혀 선택한다.
export function visibleButton(scope: Scope, name: string): Locator {
  return scope.getByRole('button', { name, exact: true }).and(scope.locator(':visible'));
}

export function visible(scope: Scope, selector: string): Locator {
  return scope.locator(selector).and(scope.locator(':visible'));
}
