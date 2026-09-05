// [지오코딩 안전장치 — 전체 스텝 하드 타임아웃](2026-09-05 사용자 지시) 단위 테스트.
import { describe, expect, it } from 'vitest';
import { withStepTimeout } from './with-step-timeout.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withStepTimeout', () => {
  it('제한 시간 안에 끝나면 그 결과를 그대로 반환한다', async () => {
    const result = await withStepTimeout(async () => 'done', { label: 'TEST_STEP', timeoutMs: 200 });
    expect(result).toBe('done');
  });

  it('제한 시간을 넘기면 타임아웃 에러로 reject한다(원래 작업은 계속 진행돼도 무방)', async () => {
    await expect(
      withStepTimeout(() => sleep(500), { label: 'STUCK_STEP', timeoutMs: 50 })
    ).rejects.toThrow(/STUCK_STEP.*하드 타임아웃/);
  });

  it('원래 작업이 던진 에러는 타임아웃과 무관하게 그대로 전달된다', async () => {
    await expect(
      withStepTimeout(
        async () => {
          throw new Error('원본 에러');
        },
        { label: 'FAILING_STEP', timeoutMs: 200 }
      )
    ).rejects.toThrow('원본 에러');
  });
});
