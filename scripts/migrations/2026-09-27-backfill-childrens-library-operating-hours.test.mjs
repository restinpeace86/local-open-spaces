import { describe, expect, it } from 'vitest';
import { computeAppendedOperatingHours } from './2026-09-27-backfill-childrens-library-operating-hours.mjs';

// [어린이도서관 후보 검수 — 휴관일 활용, 기존 행 백필](2026-09-27 사용자 지시) —
// 기존 operating_hours 값은 절대 지우지 않고 휴관일만 뒤에 이어붙이는지,
// 이미 반영된 값은 재실행해도 다시 건드리지 않는지(멱등) 검증한다.

describe('computeAppendedOperatingHours', () => {
  it('public_facility_open: 기존 값에 rstde(휴관일)를 이어붙인다', () => {
    expect(
      computeAppendedOperatingHours('public_facility_open', '평일 09:00~18:00, 주말 09:00~18:00', {
        rstde: '월+법정공휴일',
      })
    ).toBe('평일 09:00~18:00, 주말 09:00~18:00, 휴관일 월+법정공휴일');
  });

  it('seoul_public_culture: 기존 값이 null이면 휴관일 문구만 들어간다', () => {
    expect(computeAppendedOperatingHours('seoul_public_culture', null, { CLOSEDAY: '매주 월요일' })).toBe(
      '휴관일 매주 월요일'
    );
  });

  it('기존 값이 있고 원본에 특이한 정보(예: 계절별 운영)가 남아있어도 절대 지우지 않는다(실측: 남가좌새롬어린이도서관 사례)', () => {
    const before = '연 2회 (4~5월, 9~10월)10:30~17:00';
    const after = computeAppendedOperatingHours('seoul_public_culture', before, {
      OPENHOUR: '',
      CLOSEDAY: '매주 월요일 및 법정공휴일(일요일 제외)',
    });
    expect(after).toBe('연 2회 (4~5월, 9~10월)10:30~17:00, 휴관일 매주 월요일 및 법정공휴일(일요일 제외)');
  });

  it('이미 휴관일 문구가 포함돼 있으면 다시 건드리지 않는다(멱등)', () => {
    const already = '평일 09:00~18:00, 휴관일 월+법정공휴일';
    expect(computeAppendedOperatingHours('public_facility_open', already, { rstde: '월+법정공휴일' })).toBeNull();
  });

  it('원본에 휴관일 정보 자체가 없으면 null', () => {
    expect(computeAppendedOperatingHours('public_facility_open', '평일 09:00~18:00', {})).toBeNull();
  });

  it('대상 소스가 아니면 null', () => {
    expect(computeAppendedOperatingHours('tourapi_4.0', '평일 09:00~18:00', { rstde: '월' })).toBeNull();
  });
});
