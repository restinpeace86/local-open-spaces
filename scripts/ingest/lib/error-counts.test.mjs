import { describe, expect, it } from 'vitest';
import { bumpError } from './error-counts.mjs';

describe('bumpError', () => {
  it('처음 보는 타입이면 1로 시작한다', () => {
    const counts = {};
    bumpError(counts, 'MISSING_TITLE');
    expect(counts).toEqual({ MISSING_TITLE: 1 });
  });

  it('같은 타입을 여러 번 누적하면 계속 증가한다', () => {
    const counts = {};
    bumpError(counts, 'MISSING_TITLE');
    bumpError(counts, 'MISSING_TITLE');
    bumpError(counts, 'GEOCODE_FAILED');
    expect(counts).toEqual({ MISSING_TITLE: 2, GEOCODE_FAILED: 1 });
  });
});
