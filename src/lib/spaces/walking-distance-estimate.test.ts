import { describe, expect, it } from 'vitest';
import { haversineDistanceMeters, estimateWalkingDurationSeconds } from './walking-distance-estimate';

describe('haversineDistanceMeters', () => {
  it('같은 좌표는 거리 0을 반환한다', () => {
    expect(haversineDistanceMeters(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });

  it('서울시청(37.5665,126.9780)↔경복궁(37.5796,126.9770) 실제 거리(약 1.46km)와 근사한다', () => {
    const d = haversineDistanceMeters(37.5665, 126.978, 37.5796, 126.977);
    expect(d).toBeGreaterThan(1300);
    expect(d).toBeLessThan(1600);
  });
});

describe('estimateWalkingDurationSeconds', () => {
  it('시속 약 4km/h(초속 1.1m) 기준으로 소요시간을 추정한다', () => {
    // 1100m ÷ 1.1m/s = 1000초
    expect(estimateWalkingDurationSeconds(1100)).toBe(1000);
  });

  it('거리가 0이면 소요시간도 0이다', () => {
    expect(estimateWalkingDurationSeconds(0)).toBe(0);
  });
});
