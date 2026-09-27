// [어린이도서관 후보 검수 — 휴관일 활용](2026-09-27 사용자 지시): "38건의 휴관일,
// 운영시간을 실제로 뽑아 쓰는 작업까지 해" — 원본에 이미 있던 CLOSEDAY(휴관일)를
// operating_hours에 반영하는지 검증한다. OPENHOUR가 도서관류에서 자주 빈 문자열인
// 실측을 반영해 그 경우도 함께 확인한다.
import { describe, expect, it } from 'vitest';
import { buildOperatingHours, mapToOpenSpaceRow } from './cultural-spaces.mjs';

describe('buildOperatingHours', () => {
  it('OPENHOUR와 CLOSEDAY가 둘 다 있으면 이어붙인다', () => {
    expect(buildOperatingHours({ OPENHOUR: '09:00~18:00', CLOSEDAY: '매주 월요일' })).toBe(
      '09:00~18:00, 휴관일 매주 월요일'
    );
  });

  it('OPENHOUR가 빈 문자열이어도 CLOSEDAY만 있으면 그것만 표시한다(실측: 도서관 19건 중 16건 패턴)', () => {
    expect(buildOperatingHours({ OPENHOUR: '', CLOSEDAY: '매주 월요일, 법정공휴일' })).toBe('휴관일 매주 월요일, 법정공휴일');
  });

  it('둘 다 없으면 null', () => {
    expect(buildOperatingHours({ OPENHOUR: '', CLOSEDAY: '' })).toBeNull();
  });
});

describe('mapToOpenSpaceRow', () => {
  const BASE_ITEM = {
    NUM: '1',
    FAC_NAME: '노원어린이도서관',
    ADDR: '서울특별시 노원구 한글비석로 346',
    X_COORD: '37.65',
    Y_COORD: '127.06',
    ENTRFREE: '무료',
    OPENHOUR: '평일 : 오전9시~오후6시',
    CLOSEDAY: '매주 월요일 및 법정공휴일',
    HOMEPAGE: '',
  };

  it('operating_hours에 OPENHOUR와 휴관일을 함께 담는다', () => {
    const row = mapToOpenSpaceRow(BASE_ITEM);
    expect(row.operating_hours).toBe('평일 : 오전9시~오후6시, 휴관일 매주 월요일 및 법정공휴일');
  });
});
