import { describe, expect, it } from 'vitest';
import { latLngToKmaGrid } from './kma-grid';

// scripts/ingest/lib/kma-grid.test.mjs와 동일한 기준점 검증(서울시청/부산시청/제주시) —
// TS 미러가 원본과 동일한 결과를 내는지 확인한다.
describe('latLngToKmaGrid', () => {
  it('서울시청 좌표는 (60, 127)이다', () => {
    expect(latLngToKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it('부산시청 좌표는 (98, 76)이다', () => {
    expect(latLngToKmaGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });

  it('제주시 좌표는 (53, 38)이다', () => {
    expect(latLngToKmaGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
  });

  it('유효하지 않은 좌표는 에러를 던진다', () => {
    expect(() => latLngToKmaGrid(NaN, 126)).toThrow();
  });
});
