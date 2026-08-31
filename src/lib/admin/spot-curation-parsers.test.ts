import { describe, expect, it } from 'vitest';
import { parseMenuText, parseOperatingHoursText } from './spot-curation-parsers';

describe('parseOperatingHoursText', () => {
  it('단순 영업시간(10:00~22:00)만 있으면 open/close만 채우고 나머지는 null이다', () => {
    const result = parseOperatingHoursText('매일 10:00~22:00');
    expect(result).toEqual({ openTime: '10:00', closeTime: '22:00', breakStart: null, breakEnd: null, lastOrder: null });
  });

  it('하이픈(-) 구분자도 인식한다', () => {
    const result = parseOperatingHoursText('10:00-22:00');
    expect(result.openTime).toBe('10:00');
    expect(result.closeTime).toBe('22:00');
  });

  it('브레이크타임과 라스트오더가 함께 있으면 모두 분리해 채운다', () => {
    const result = parseOperatingHoursText('영업시간 10:00~22:00 (브레이크타임 15:00~17:00, 라스트오더 21:30)');
    expect(result).toEqual({
      openTime: '10:00',
      closeTime: '22:00',
      breakStart: '15:00',
      breakEnd: '17:00',
      lastOrder: '21:30',
    });
  });

  it('"휴게시간"이라는 표현과 "L.O" 표현도 인식한다', () => {
    const result = parseOperatingHoursText('09:00~21:00 휴게시간 14:00~16:00 L.O 20:30');
    expect(result.breakStart).toBe('14:00');
    expect(result.breakEnd).toBe('16:00');
    expect(result.lastOrder).toBe('20:30');
  });

  it('빈 문자열이면 전부 null을 반환한다', () => {
    expect(parseOperatingHoursText('')).toEqual({
      openTime: null,
      closeTime: null,
      breakStart: null,
      breakEnd: null,
      lastOrder: null,
    });
  });

  it('시간 정보가 전혀 없는 텍스트는 전부 null이다(추측해서 채우지 않음)', () => {
    const result = parseOperatingHoursText('연중무휴, 전화 문의 바랍니다');
    expect(result).toEqual({ openTime: null, closeTime: null, breakStart: null, breakEnd: null, lastOrder: null });
  });
});

describe('parseMenuText', () => {
  it('"이름 가격원" 형식의 여러 줄을 구조화된 배열로 변환한다', () => {
    const result = parseMenuText('짜장면 7,000원\n짬뽕 9,000원\n탕수육(소) 15,000원');
    expect(result).toEqual([
      { name: '짜장면', price: 7000 },
      { name: '짬뽕', price: 9000 },
      { name: '탕수육(소)', price: 15000 },
    ]);
  });

  it('쉼표 없는 가격, "원" 없는 가격도 인식한다', () => {
    const result = parseMenuText('아메리카노 4500\n카페라떼 5000원');
    expect(result).toEqual([
      { name: '아메리카노', price: 4500 },
      { name: '카페라떼', price: 5000 },
    ]);
  });

  it('빈 줄은 건너뛰고, 가격을 찾을 수 없는 줄은 결과에서 제외한다', () => {
    const result = parseMenuText('짜장면 7,000원\n\n영업시간 안내\n짬뽕 9,000원');
    expect(result).toEqual([
      { name: '짜장면', price: 7000 },
      { name: '짬뽕', price: 9000 },
    ]);
  });

  it('빈 문자열이면 빈 배열을 반환한다', () => {
    expect(parseMenuText('')).toEqual([]);
  });
});
