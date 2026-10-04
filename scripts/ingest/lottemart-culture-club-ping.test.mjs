// [롯데마트 문화센터 변화 감지 ping](2026-10-04) — hasChanged() 단위 테스트.
import { describe, expect, it } from 'vitest';
import { hasChanged } from './lottemart-culture-club-ping.mjs';

describe('hasChanged', () => {
  it('이전 기록이 없으면(처음 보는 지점) 변화로 간주한다', () => {
    expect(hasChanged(null, { acceptTotalCnt: 10, onlnCloseTotalCnt: 5, acceptCloseTotalCnt: 20 })).toBe(true);
  });

  it('3개 버킷 건수가 전부 동일하면 변화 없음으로 판단한다', () => {
    const prev = { accept_total_cnt: 34, onln_close_total_cnt: 0, accept_close_total_cnt: 320 };
    const current = { acceptTotalCnt: 34, onlnCloseTotalCnt: 0, acceptCloseTotalCnt: 320 };
    expect(hasChanged(prev, current)).toBe(false);
  });

  it('접수가능 건수만 달라져도(예: 전화문의→바로신청 전환) 변화로 감지한다', () => {
    const prev = { accept_total_cnt: 34, onln_close_total_cnt: 0, accept_close_total_cnt: 320 };
    const current = { acceptTotalCnt: 35, onlnCloseTotalCnt: 0, acceptCloseTotalCnt: 319 };
    expect(hasChanged(prev, current)).toBe(true);
  });

  it('온라인마감 건수만 달라져도 변화로 감지한다', () => {
    const prev = { accept_total_cnt: 34, onln_close_total_cnt: 0, accept_close_total_cnt: 320 };
    const current = { acceptTotalCnt: 34, onlnCloseTotalCnt: 1, acceptCloseTotalCnt: 319 };
    expect(hasChanged(prev, current)).toBe(true);
  });
});
