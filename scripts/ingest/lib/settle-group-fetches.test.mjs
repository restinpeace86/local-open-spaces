import { describe, expect, it, vi } from 'vitest';
import { settleGroupFetches } from './settle-group-fetches.mjs';

describe('settleGroupFetches', () => {
  it('모두 성공하면 각 name으로 결과를 반환한다', async () => {
    const result = await settleGroupFetches('TEST_SOURCE', [
      { name: 'a', run: () => Promise.resolve(['a1', 'a2']) },
      { name: 'b', run: () => Promise.resolve(['b1']) },
    ]);

    expect(result).toEqual({ a: ['a1', 'a2'], b: ['b1'] });
  });

  it('하나만 실패해도 나머지는 정상적으로 결과를 받는다(격리)', async () => {
    const result = await settleGroupFetches('TEST_SOURCE', [
      { name: 'a', run: () => Promise.reject(new Error('a 실패')) },
      { name: 'b', run: () => Promise.resolve(['b1']) },
    ]);

    expect(result.a).toBeNull();
    expect(result.b).toEqual(['b1']);
  });

  it('전부 실패하면 예외를 던진다', async () => {
    await expect(
      settleGroupFetches('TEST_SOURCE', [
        { name: 'a', run: () => Promise.reject(new Error('a 실패')) },
        { name: 'b', run: () => Promise.reject(new Error('b 실패')) },
      ])
    ).rejects.toThrow(/TEST_SOURCE.*a:a 실패.*b:b 실패/);
  });

  it('실패한 작업이 있어도 성공한 작업의 run()은 재호출되지 않는다(이미 완료된 Promise를 그대로 씀)', async () => {
    const runA = vi.fn(() => Promise.resolve(['a1']));
    const runB = vi.fn(() => Promise.reject(new Error('b 실패')));

    await settleGroupFetches('TEST_SOURCE', [
      { name: 'a', run: runA },
      { name: 'b', run: runB },
    ]);

    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(1);
  });
});
