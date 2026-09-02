import { describe, expect, it } from 'vitest';
import { calculateGrade } from './mom-pick-grade-calc.mjs';

// [Decision 019](2026-09-02): src/lib/community/grades.test.ts와 동일한 케이스를 이
// 독립 mjs 구현에 대해서도 검증해 두 구현이 drift하지 않는지 확인한다.
describe('mom-pick-grade-calc (batch용 독립 구현)', () => {
  it('한 번도 작성한 적 없으면 signed_up', () => {
    expect(calculateGrade({ hasEverPosted: false, monthlyPostCount: 0, isPowerMomThisMonth: false })).toBe('signed_up');
  });

  it('평생 1회 이상이지만 이번 달 실적 0이면 sprout로 즉시 강등', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 0, isPowerMomThisMonth: false })).toBe('sprout');
  });

  it('이번 달 2건 이상이면 active', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 2, isPowerMomThisMonth: false })).toBe('active');
  });

  it('이번 달 5건 이상이면 excellent', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 5, isPowerMomThisMonth: false })).toBe('excellent');
  });

  it('우수맘 조건 + 파워맘 정원 선발이면 power', () => {
    expect(calculateGrade({ hasEverPosted: true, monthlyPostCount: 8, isPowerMomThisMonth: true })).toBe('power');
  });
});
