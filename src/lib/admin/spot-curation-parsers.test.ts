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

  // [실사용 버그 제보](2026-09-02): "시간이 키워드보다 앞에" 오는 실제 붙여넣기 형식에서
  // 브레이크타임/라스트오더가 전혀 파싱되지 않던 문제 — 실제 제보 원문 그대로 검증한다.
  it('시간이 브레이크타임/라스트오더 키워드보다 앞에 오는 실사용 형식도 정확히 파싱한다', () => {
    const result = parseOperatingHoursText('매일\n11:00 - 21:00\n15:00 - 17:00 브레이크타임\n20:30 라스트오더');
    expect(result).toEqual({
      openTime: '11:00',
      closeTime: '21:00',
      breakStart: '15:00',
      breakEnd: '17:00',
      lastOrder: '20:30',
    });
  });

  it('여러 줄로 나뉘어 있어도 각 줄 안에서 키워드와 가장 가까운 시간을 찾는다', () => {
    const result = parseOperatingHoursText('영업시간\n10:00~22:00\n브레이크타임 15:00~17:00\nL.O 21:30');
    expect(result).toEqual({
      openTime: '10:00',
      closeTime: '22:00',
      breakStart: '15:00',
      breakEnd: '17:00',
      lastOrder: '21:30',
    });
  });

  // [실사용 질문](2026-09-02) "오픈/close/브레이크타임/라스트오더가 순서대로 안 있어도
  // 문제없나?": 각 줄을 키워드 존재 여부로만 판단하므로(위치/순서에 의존하지 않음)
  // 줄 순서가 뒤섞여도 동일하게 정확히 파싱됨을 명시적으로 검증한다.
  it('브레이크타임/라스트오더/메인 시간의 줄 순서가 뒤섞여 있어도 정확히 파싱한다', () => {
    const result = parseOperatingHoursText('20:30 라스트오더\n15:00 - 17:00 브레이크타임\n매일\n11:00 - 21:00');
    expect(result).toEqual({
      openTime: '11:00',
      closeTime: '21:00',
      breakStart: '15:00',
      breakEnd: '17:00',
      lastOrder: '20:30',
    });
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

  // [실사용 버그 제보](2026-09-02): 배달앱/홈페이지 메뉴판을 그대로 복사-붙여넣기하면
  // "이름" / (빈 줄) / "가격만 있는 줄" / (빈 줄) / "설명"이 반복되는 형식이 되는데,
  // 기존 파서는 이 형식을 단 한 줄도 인식하지 못했다 — 실제 제보 원문 그대로 검증한다.
  it('이름/가격/설명이 각각 별도 줄(빈 줄 구분)로 나뉜 그룹 형식도 인식한다', () => {
    const text = [
      '하노이 쌀국수',
      '',
      '12,000원',
      '',
      '24시간 우린 진한 육수에 쌀국수 면이 퐁당~현지쉐프에 비법이 들어간 쌀국수',
      '',
      '하노이 고급쌀국수',
      '',
      '14,000원',
      '',
      '안심,차돌박이,양지가 듬뿍 들어가 다양한 고기 식감을 가진 하노이 고급쌀국수',
      '',
      '수제 넴(짜조)',
      '',
      '8,000원',
      '',
      '매일 아침 직접만드는 속이 꽉찬 겉바속촉 100% 수제 베트남식 수제만두',
    ].join('\n');

    expect(parseMenuText(text)).toEqual([
      { name: '하노이 쌀국수', price: 12000 },
      { name: '하노이 고급쌀국수', price: 14000 },
      { name: '수제 넴(짜조)', price: 8000 },
    ]);
  });

  it('그룹 형식과 기존 단일 줄 형식이 섞여 있어도 각각 올바르게 처리한다', () => {
    const text = ['아메리카노', '4,500원', '짜장면 7,000원', '카페라떼', '5,000원'].join('\n');
    expect(parseMenuText(text)).toEqual([
      { name: '아메리카노', price: 4500 },
      { name: '짜장면', price: 7000 },
      { name: '카페라떼', price: 5000 },
    ]);
  });

  it('설명 줄 뒤에 가격이 다시 나오지 않으면(짝이 없으면) 항목을 만들지 않는다', () => {
    // 마지막 "설명"만 있고 그 뒤에 가격이 없는 경우 — 추측으로 항목을 만들지 않는다.
    const text = ['탕수육', '15,000원', '설명입니다'].join('\n');
    expect(parseMenuText(text)).toEqual([{ name: '탕수육', price: 15000 }]);
  });
});
