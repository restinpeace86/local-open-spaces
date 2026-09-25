import { describe, expect, it } from 'vitest';
import {
  detectKidsMenuItems,
  parseEntranceFeeText,
  parseMenuText,
  parseOperatingHoursText,
  extractRegularWeekdayHours,
} from './spot-curation-parsers';
import type { NaverPlaceBusinessHourDay } from './naver-place-crawler';

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

  // [실사용 버그 제보](2026-09-26 사용자 지시, 찜질방/스파 가격표): "유아(12개월미만)"
  // 다음 줄에 "무료"만 있으면 기존엔 숫자가 없어 통째로 누락됐다. "무료"는 데이터
  // 없음이 아니라 명시적인 0원이라 별도로 인식한다(price-parser.mjs와 동일한 판단).
  it('그룹 형식의 가격 자리에 "무료"만 있으면 0원으로 인식한다', () => {
    const text = [
      '주간 성인 12,000원',
      '야간 성인 13,000원',
      '찜질복 2,000원',
      '야간 6세이하아동 9,000원',
      '주간 6세이하아동 8,000원',
      '유아(12개월미만)',
      '무료',
    ].join('\n');

    expect(parseMenuText(text)).toEqual([
      { name: '주간 성인', price: 12000 },
      { name: '야간 성인', price: 13000 },
      { name: '찜질복', price: 2000 },
      { name: '야간 6세이하아동', price: 9000 },
      { name: '주간 6세이하아동', price: 8000 },
      { name: '유아(12개월미만)', price: 0 },
    ]);
  });

  it('"이름 무료"처럼 한 줄에 같이 있어도 0원으로 인식한다', () => {
    expect(parseMenuText('유아 무료')).toEqual([{ name: '유아', price: 0 }]);
  });
});

// [가격 및 입장료 스마트 파싱](2026-09-08 사용자 지시, todo.md 개선사항1-3):
// "네이버 플레이스 등의 가격 텍스트를.. 어린이 요금, 보호자 요금 등의 필드에
// 숫자가 자동으로 쪼개져 매핑되도록"
describe('parseEntranceFeeText', () => {
  it('"아동/보호자" 키워드가 붙은 줄에서 각각 금액을 뽑아낸다', () => {
    const result = parseEntranceFeeText('아동 12,000원\n보호자 5,000원');
    expect(result).toEqual({ childFee: 12000, guardianFee: 5000 });
  });

  it('"소인/대인" 같은 다른 표기의 동의어도 인식한다', () => {
    const result = parseEntranceFeeText('입장료\n소인 15000\n대인 8000');
    expect(result).toEqual({ childFee: 15000, guardianFee: 8000 });
  });

  // 한 줄에 두 대상 요금이 함께 있으면, 각 키워드에 가장 가까운 금액을
  // 채택해야 한다("첫 번째 금액을 무조건 채택"하면 어른 요금에 어린이
  // 금액이 잘못 붙는다).
  it('"어린이/어른" 표기도 인식하고, 한 줄에 둘 다 있어도 가까운 금액끼리 정확히 짝짓는다', () => {
    const result = parseEntranceFeeText('어린이 10,000원 / 어른 3,000원');
    expect(result).toEqual({ childFee: 10000, guardianFee: 3000 });
  });

  it('한쪽 키워드만 있으면 그 쪽만 채우고 나머지는 null이다', () => {
    expect(parseEntranceFeeText('아동 12,000원')).toEqual({ childFee: 12000, guardianFee: null });
  });

  it('키워드가 있어도 금액을 찾지 못하면 null로 남긴다(추측 금지)', () => {
    expect(parseEntranceFeeText('아동 동반 시 보호자 무료 입장 가능')).toEqual({ childFee: null, guardianFee: null });
  });

  it('빈 문자열이면 둘 다 null이다', () => {
    expect(parseEntranceFeeText('')).toEqual({ childFee: null, guardianFee: null });
  });
});

// [스팟 큐레이션 메뉴 파싱 및 '키즈메뉴' 자동 감지](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 5]).
describe('detectKidsMenuItems', () => {
  it('키워드 사전에 있는 메뉴는 is_kids_menu:true로 표시한다', () => {
    const result = detectKidsMenuItems([
      { name: '치즈돈까스', price: 9000 },
      { name: '주먹밥 세트', price: 6000 },
    ]);
    expect(result).toEqual([
      { name: '치즈돈까스', price: 9000, is_kids_menu: true },
      { name: '주먹밥 세트', price: 6000, is_kids_menu: true },
    ]);
  });

  // [오탐지 방지] 요청 원문 "일반 공기밥, 설렁탕류, 냉동너겟 등은 철저히 배제" —
  // 키워드 사전에 없는 일반 메뉴는 매칭되지 않아야 한다.
  it('키워드 사전에 없는 일반 메뉴(공기밥/설렁탕/냉동너겟 등)는 is_kids_menu:false다', () => {
    const result = detectKidsMenuItems([
      { name: '공기밥', price: 1000 },
      { name: '설렁탕', price: 12000 },
      { name: '냉동너겟', price: 5000 },
    ]);
    expect(result.every((item) => item.is_kids_menu === false)).toBe(true);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(detectKidsMenuItems([])).toEqual([]);
  });

  it('이미 is_kids_menu가 있어도 새로 재판정한 값으로 덮어쓴다', () => {
    const result = detectKidsMenuItems([{ name: '계란찜', price: 4000, is_kids_menu: false }]);
    expect(result[0].is_kids_menu).toBe(true);
  });
});

// [스팟 큐레이션 요일별 영업시간](2026-09-19 사용자 지시): 실측 확인한 실제 스키마
// (딸부자 닭갈비 닭도리탕) 그대로의 픽스처로 검증한다.
describe('extractRegularWeekdayHours', () => {
  function day(overrides: Partial<NaverPlaceBusinessHourDay> = {}): NaverPlaceBusinessHourDay {
    return { day: '월', start: '09:00', end: '18:00', breakStart: null, breakEnd: null, description: null, ...overrides };
  }

  it('요일별로 다른 시간이면 각 요일에 각자의 시간을 채운다', () => {
    const result = extractRegularWeekdayHours([
      day({ day: '토', start: '11:00', end: '22:00' }),
      day({ day: '일', start: '11:00', end: '22:00' }),
      day({ day: '월', start: '14:00', end: '22:00' }),
      day({ day: '화', start: '14:00', end: '22:00' }),
      day({ day: '수', start: '14:00', end: '22:00' }),
    ]);
    expect(result).toEqual([
      { day: '토', open: '11:00', close: '22:00' },
      { day: '일', open: '11:00', close: '22:00' },
      { day: '월', open: '14:00', close: '22:00' },
      { day: '화', open: '14:00', close: '22:00' },
      { day: '수', open: '14:00', close: '22:00' },
    ]);
  });

  it('모든 요일이 같은 시간이면 그대로 각 요일에 동일한 시간이 담긴다(별도 병합 로직 불필요)', () => {
    const allDays = ['월', '화', '수', '목', '금', '토', '일'];
    const result = extractRegularWeekdayHours(allDays.map((d) => day({ day: d, start: '08:00', end: '20:00' })));
    expect(result).toHaveLength(7);
    expect(result.every((r) => r.open === '08:00' && r.close === '20:00')).toBe(true);
  });

  // [일시적 예외 제외](2026-09-19 사용자 확인 "그냥 넘어가자") — 실측: 딸부자 닭갈비의
  // 실제 목/금은 "목(9/24) 추석 연휴"/"금(9/25) 추석"처럼 임시 스케줄로만 잡혀 있었다.
  it('day에 괄호+날짜가 붙은 임시 스케줄(공휴일 등)은 제외한다', () => {
    const result = extractRegularWeekdayHours([
      day({ day: '토', start: '11:00', end: '22:00' }),
      day({ day: '목(9/24)', start: '11:00', end: '22:00', description: '추석 연휴' }),
      day({ day: '금(9/25)', start: '11:00', end: '22:00', description: '추석' }),
    ]);
    expect(result).toEqual([{ day: '토', open: '11:00', close: '22:00' }]);
  });

  it('정규 스케줄이 아예 없으면 빈 배열이다(억지로 추정해 채우지 않음)', () => {
    expect(extractRegularWeekdayHours([day({ day: '목(9/24)' })])).toEqual([]);
  });

  it('휴무일(start/end가 null)은 open/close가 null로 담긴다', () => {
    const result = extractRegularWeekdayHours([day({ day: '월', start: null, end: null, description: '정기휴무' })]);
    expect(result).toEqual([{ day: '월', open: null, close: null }]);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(extractRegularWeekdayHours([])).toEqual([]);
  });
});
