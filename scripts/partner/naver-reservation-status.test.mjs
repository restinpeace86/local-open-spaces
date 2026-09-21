import { describe, expect, it } from 'vitest';
import { mapNaverReservationStatus } from './naver-reservation-status.mjs';

describe('mapNaverReservationStatus', () => {
  it.each([
    ['취소', 'cancelled'],
    ['예약취소', 'cancelled'],
    ['노쇼', 'noshow'],
    ['완료', 'completed'],
    ['이용완료', 'completed'],
    ['확정', 'confirmed'],
    ['예약확정', 'confirmed'],
  ])('"%s"는 %s로 매핑된다', (label, expected) => {
    expect(mapNaverReservationStatus(label)).toBe(expected);
  });

  it('알 수 없는 라벨은 추측하지 않고 null을 반환한다', () => {
    expect(mapNaverReservationStatus('처리중')).toBeNull();
  });

  it('빈 값/undefined도 null을 반환한다', () => {
    expect(mapNaverReservationStatus('')).toBeNull();
    expect(mapNaverReservationStatus(undefined)).toBeNull();
  });
});
