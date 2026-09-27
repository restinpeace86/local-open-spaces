import { describe, expect, it } from 'vitest';
import { isOpenSpaceClosedOn } from './open-space-closure';

// [open_spaces 정기휴무 마커/리스트 표시](2026-09-27 사용자 지시) — 지도/리스트가
// "오늘 휴무"를 판정할 때 쓰는 순수 함수를 검증한다.
describe('isOpenSpaceClosedOn', () => {
  it('excluded_weekdays에 오늘 요일이 있으면 true', () => {
    const monday = new Date('2026-09-28T00:00:00'); // 월요일
    expect(isOpenSpaceClosedOn(['MON'], null, monday)).toBe(true);
  });

  it('excluded_weekdays에 오늘 요일이 없으면 false', () => {
    const tuesday = new Date('2026-09-29T00:00:00'); // 화요일
    expect(isOpenSpaceClosedOn(['MON'], null, tuesday)).toBe(false);
  });

  it('excluded_nth_weekdays가 오늘의 "N번째 요일" 토큰과 일치하면 true', () => {
    // 2026-09-07은 월요일이고 그 달의 1번째 월요일이다.
    const firstMondayOfMonth = new Date('2026-09-07T00:00:00');
    expect(isOpenSpaceClosedOn(null, ['1-MON'], firstMondayOfMonth)).toBe(true);
  });

  it('excluded_nth_weekdays가 있어도 주차가 다르면 false', () => {
    // 2026-09-07은 1번째 월요일 — 2번째 월요일 규칙과는 안 맞음.
    const firstMondayOfMonth = new Date('2026-09-07T00:00:00');
    expect(isOpenSpaceClosedOn(null, ['2-MON'], firstMondayOfMonth)).toBe(false);
  });

  it('둘 다 null/undefined면 false(휴무 규칙 없음)', () => {
    expect(isOpenSpaceClosedOn(null, null, new Date())).toBe(false);
    expect(isOpenSpaceClosedOn(undefined, undefined, new Date())).toBe(false);
  });

  it('두 규칙이 동시에 있고 요일 규칙만 맞아도 true(둘 중 하나만 맞으면 휴무)', () => {
    const monday = new Date('2026-09-28T00:00:00');
    expect(isOpenSpaceClosedOn(['MON'], ['3-SAT'], monday)).toBe(true);
  });
});
