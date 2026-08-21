import { describe, expect, it } from 'vitest';
import { formatDistance, formatVenueLine } from './format';

describe('formatDistance', () => {
  it('1000m 미만이면 반올림한 m 단위로 표시한다', () => {
    expect(formatDistance(850)).toBe('850m');
  });

  it('1000m 이상이면 소수점 1자리 km 단위로 표시한다', () => {
    expect(formatDistance(3200)).toBe('3.2km');
  });
});

// Task 9-1-1: "[장소명] · [거리]" 형태 통일 표기 검증
describe('formatVenueLine', () => {
  it('장소명과 거리가 모두 있으면 "장소명 · 거리" 형태로 합친다', () => {
    expect(formatVenueLine('율동공원 야외무대', 3200)).toBe('율동공원 야외무대 · 3.2km');
  });

  it('거리 정보가 없으면(distance_meters < 0) 장소명만 표시한다', () => {
    expect(formatVenueLine('율동공원 야외무대', -1)).toBe('율동공원 야외무대');
  });

  it('장소명이 없으면 거리만 표시한다', () => {
    expect(formatVenueLine(null, 500)).toBe('500m');
  });

  it('둘 다 없으면 빈 문자열을 반환한다(플레이스홀더 문구 없음)', () => {
    expect(formatVenueLine(null, -1)).toBe('');
  });
});
