// [파이프라인 로그 DB화](2026-09-15): recordPipelineRun()은 제거되고(batch-log.mjs의
// recordBatchRun()으로 통합, 해당 파일 상단 주석 참고) countRawItems()만 남았다.
import { describe, expect, it } from 'vitest';
import { countRawItems } from './pipeline-log.mjs';

describe('countRawItems', () => {
  it('배열이면 길이를 그대로 반환한다', () => {
    expect(countRawItems([1, 2, 3])).toBe(3);
  });

  it('배열 묶음 객체(gg-culture-events-adapter.mjs류)면 각 배열 길이의 합을 반환한다', () => {
    expect(countRawItems({ cultureEventItems: [1, 2], foundationEventItems: [1, 2, 3] })).toBe(5);
  });

  it('배열도 객체도 아니면 null을 반환한다', () => {
    expect(countRawItems(null)).toBeNull();
    expect(countRawItems(undefined)).toBeNull();
  });
});
