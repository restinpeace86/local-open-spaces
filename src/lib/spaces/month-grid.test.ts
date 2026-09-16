import { describe, expect, it } from 'vitest';
import { buildMonthDateGrid, toDateKey } from './month-grid';

describe('buildMonthDateGrid', () => {
  it('42칸(6주) 그리드를 일요일부터 시작해 만든다', () => {
    const grid = buildMonthDateGrid(2026, 9); // 2026-09-01은 화요일
    expect(grid).toHaveLength(42);
    expect(grid[0].date.getDay()).toBe(0);
    expect(grid[0].dateKey).toBe('2026-08-30');
  });

  it('이번 달에 속하지 않는 날짜는 inCurrentMonth가 false다', () => {
    const grid = buildMonthDateGrid(2026, 9);
    expect(grid[0].inCurrentMonth).toBe(false);
    const sep1 = grid.find((d) => d.dateKey === '2026-09-01');
    expect(sep1?.inCurrentMonth).toBe(true);
  });
});

describe('toDateKey', () => {
  it('YYYY-MM-DD 형식으로 변환한다(한 자리 월/일은 0으로 채움)', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
