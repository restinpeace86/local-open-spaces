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

// Task 9-1-3: "[장소명] · [시/군/구]" 형태 통일 표기 검증(거리 계산 제거)
describe('formatVenueLine', () => {
  it('장소명과 시/군/구가 모두 있으면 "장소명 · 시/군/구" 형태로 합친다', () => {
    expect(formatVenueLine('율동공원 야외무대', '성남시 분당구')).toBe('율동공원 야외무대 · 성남시 분당구');
  });

  it('시/군/구 정보가 없으면 장소명만 표시한다', () => {
    expect(formatVenueLine('율동공원 야외무대', null)).toBe('율동공원 야외무대');
  });

  it('장소명이 없으면 시/군/구만 표시한다', () => {
    expect(formatVenueLine(null, '성남시 분당구')).toBe('성남시 분당구');
  });

  it('둘 다 없으면 빈 문자열을 반환한다(플레이스홀더 문구 없음)', () => {
    expect(formatVenueLine(null, null)).toBe('');
  });

  it('시/군/구가 없고 거리(distanceMeters)가 주어지면 거리로 대체한다(지역 도감 페이지 호환)', () => {
    expect(formatVenueLine('율동공원 야외무대', null, 3200)).toBe('율동공원 야외무대 · 3.2km');
  });

  it('시/군/구가 있으면 거리보다 우선한다', () => {
    expect(formatVenueLine('율동공원 야외무대', '성남시 분당구', 3200)).toBe('율동공원 야외무대 · 성남시 분당구');
  });
});
