import { describe, expect, it, vi } from 'vitest';
import { rpcWithRetry } from './rpc-retry';

describe('rpcWithRetry', () => {
  it('첫 시도에 성공하면 재시도 없이 결과를 반환한다', async () => {
    const fn = vi.fn().mockResolvedValue({ data: ['a'], error: null });
    const result = await rpcWithRetry(fn, 2, 1);
    expect(result).toEqual({ data: ['a'], error: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('실패 후 재시도에서 성공하면 그 결과를 반환한다', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'statement timeout' } })
      .mockResolvedValueOnce({ data: ['a', 'b'], error: null });
    const result = await rpcWithRetry(fn, 2, 1);
    expect(result).toEqual({ data: ['a', 'b'], error: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('모든 시도가 실패하면 마지막 실패 결과를 그대로 반환한다', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: { message: 'statement timeout' } });
    const result = await rpcWithRetry(fn, 2, 1);
    expect(result.error?.message).toBe('statement timeout');
    expect(fn).toHaveBeenCalledTimes(3); // 최초 시도 1회 + 재시도 2회
  });
});
