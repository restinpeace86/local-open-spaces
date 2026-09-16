import { describe, expect, it } from 'vitest';
import { computeOperatingDates, isEventOpenOnDate, isEventOperatingOn } from './event-operating-schedule';

// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자 지시)
describe('isEventOperatingOn', () => {
  it('규칙이 없으면(둘 다 null) 무슨 요일이든 운영한다(기본값 — 매일 운영)', () => {
    const monday = new Date('2026-09-14T00:00:00'); // 2026-09-14는 월요일
    expect(isEventOperatingOn({ operating_weekdays: null, excluded_weekdays: null }, monday)).toBe(true);
  });

  it('빈 배열도 제약 없음(매일 운영)으로 취급한다', () => {
    const monday = new Date('2026-09-14T00:00:00');
    expect(isEventOperatingOn({ operating_weekdays: [], excluded_weekdays: [] }, monday)).toBe(true);
  });

  // [사용자 제시 예시] "정기 휴무일이 매주 월요일이라고 했을 때 오늘이 월요일이면
  // 해당 이벤트 팝업은 안나와야겠지?"
  it('정기 휴무일(월요일)이 지정돼 있고 오늘이 월요일이면 운영하지 않는다', () => {
    const monday = new Date('2026-09-14T00:00:00');
    expect(isEventOperatingOn({ excluded_weekdays: ['MON'] }, monday)).toBe(false);
  });

  it('정기 휴무일이 월요일이어도 오늘이 화요일이면 운영한다', () => {
    const tuesday = new Date('2026-09-15T00:00:00');
    expect(isEventOperatingOn({ excluded_weekdays: ['MON'] }, tuesday)).toBe(true);
  });

  it('"주말만 운영"(토·일)이면 평일에는 운영하지 않는다', () => {
    const wednesday = new Date('2026-09-16T00:00:00');
    expect(isEventOperatingOn({ operating_weekdays: ['SAT', 'SUN'] }, wednesday)).toBe(false);
  });

  it('"주말만 운영"(토·일)이면 토요일/일요일엔 운영한다', () => {
    const saturday = new Date('2026-09-19T00:00:00');
    const sunday = new Date('2026-09-20T00:00:00');
    expect(isEventOperatingOn({ operating_weekdays: ['SAT', 'SUN'] }, saturday)).toBe(true);
    expect(isEventOperatingOn({ operating_weekdays: ['SAT', 'SUN'] }, sunday)).toBe(true);
  });

  it('"특정 요일 지정"(화, 목)이면 그 외 요일엔 운영하지 않는다', () => {
    const tuesday = new Date('2026-09-15T00:00:00');
    const thursday = new Date('2026-09-17T00:00:00');
    const monday = new Date('2026-09-14T00:00:00');
    expect(isEventOperatingOn({ operating_weekdays: ['TUE', 'THU'] }, tuesday)).toBe(true);
    expect(isEventOperatingOn({ operating_weekdays: ['TUE', 'THU'] }, thursday)).toBe(true);
    expect(isEventOperatingOn({ operating_weekdays: ['TUE', 'THU'] }, monday)).toBe(false);
  });

  it('허용 요일과 휴무 요일을 조합할 수 있다(허용 요일에 포함돼도 휴무 요일이면 운영 안 함)', () => {
    // "화,목만 운영하되 그중 목요일은 휴무" — 화요일만 실제로 운영.
    const schedule = { operating_weekdays: ['TUE', 'THU'], excluded_weekdays: ['THU'] };
    const tuesday = new Date('2026-09-15T00:00:00');
    const thursday = new Date('2026-09-17T00:00:00');
    expect(isEventOperatingOn(schedule, tuesday)).toBe(true);
    expect(isEventOperatingOn(schedule, thursday)).toBe(false);
  });

  // [매월 N번째 요일 패턴 추가](2026-09-12 사용자 지시): "매월 2번째 4번째 토요일" —
  // 2026년 9월의 토요일은 5(1번째)/12(2번째)/19(3번째)/26(4번째)일이다(실측 확인).
  describe('매월 N번째 요일 패턴(operating_nth_weekdays)', () => {
    const schedule = { operating_nth_weekdays: ['2-SAT', '4-SAT'] };

    it('2번째 토요일(9/12)에는 운영한다', () => {
      expect(isEventOperatingOn(schedule, new Date('2026-09-12T00:00:00'))).toBe(true);
    });

    it('4번째 토요일(9/26)에는 운영한다', () => {
      expect(isEventOperatingOn(schedule, new Date('2026-09-26T00:00:00'))).toBe(true);
    });

    it('1번째 토요일(9/5)이나 3번째 토요일(9/19)에는 운영하지 않는다', () => {
      expect(isEventOperatingOn(schedule, new Date('2026-09-05T00:00:00'))).toBe(false);
      expect(isEventOperatingOn(schedule, new Date('2026-09-19T00:00:00'))).toBe(false);
    });

    it('토요일이 아닌 날에는 운영하지 않는다', () => {
      expect(isEventOperatingOn(schedule, new Date('2026-09-15T00:00:00'))).toBe(false); // 화요일
    });

    it('operating_nth_weekdays가 있으면 operating_weekdays는 무시된다(상호 배타적 대안 규칙)', () => {
      // operating_weekdays로는 매주 화요일도 허용하지만, nth 규칙이 있으면 그쪽이 우선한다.
      const combined = { operating_weekdays: ['TUE'], operating_nth_weekdays: ['2-SAT'] };
      const tuesday = new Date('2026-09-15T00:00:00');
      const secondSaturday = new Date('2026-09-12T00:00:00');
      expect(isEventOperatingOn(combined, tuesday)).toBe(false);
      expect(isEventOperatingOn(combined, secondSaturday)).toBe(true);
    });

    it('정기 휴무 요일은 매월 N번째 요일 규칙과도 조합되며 항상 우선한다', () => {
      // "2번째·4번째 토요일 운영"이더라도 토요일 자체가 정기 휴무면 운영하지 않는다.
      const withExclusion = { operating_nth_weekdays: ['2-SAT', '4-SAT'], excluded_weekdays: ['SAT'] };
      expect(isEventOperatingOn(withExclusion, new Date('2026-09-12T00:00:00'))).toBe(false);
    });
  });
});

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2])
describe('isEventOpenOnDate', () => {
  const schedule = { excluded_weekdays: ['MON'] };
  const startDate = '2026-09-01';
  const endDate = '2026-09-30';

  it('기간 안이고 정기 휴무 요일이 아니면 연다', () => {
    expect(isEventOpenOnDate(schedule, new Set(), startDate, endDate, new Date('2026-09-15T00:00:00'))).toBe(true);
  });

  it('기간 밖이면 요일 규칙과 무관하게 닫는다', () => {
    expect(isEventOpenOnDate(schedule, new Set(), startDate, endDate, new Date('2026-10-05T00:00:00'))).toBe(false);
    expect(isEventOpenOnDate(schedule, new Set(), startDate, endDate, new Date('2026-08-25T00:00:00'))).toBe(false);
  });

  it('정기 휴무 요일(월요일)이면 닫는다', () => {
    expect(isEventOpenOnDate(schedule, new Set(), startDate, endDate, new Date('2026-09-14T00:00:00'))).toBe(false);
  });

  // [사용자 요구사항 원문] "관리자가 연간 예외 공휴일 등을 수동으로 관리" — 원래
  // 운영일(화요일)이라도 예외 날짜로 지정되면 그날만 닫는다.
  it('원래 운영일이어도 예외 날짜로 지정되면 그 날만 닫는다', () => {
    const exceptionDates = new Set(['2026-09-15']);
    expect(isEventOpenOnDate(schedule, exceptionDates, startDate, endDate, new Date('2026-09-15T00:00:00'))).toBe(false);
    expect(isEventOpenOnDate(schedule, exceptionDates, startDate, endDate, new Date('2026-09-16T00:00:00'))).toBe(true);
  });
});

describe('computeOperatingDates', () => {
  it('기간 전체에서 정기 휴무 요일과 예외 날짜를 제외한 실제 운영일만 반환한다', () => {
    // 2026-09-01(화)~2026-09-07(월), 월요일 정기 휴무 + 9/3(목) 예외 휴무.
    const dates = computeOperatingDates({
      schedule: { excluded_weekdays: ['MON'] },
      exceptionDates: ['2026-09-03'],
      startDate: '2026-09-01',
      endDate: '2026-09-07',
    });
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06']);
  });

  it('규칙이 전혀 없으면 기간 전체가 운영일이다', () => {
    const dates = computeOperatingDates({
      schedule: {},
      exceptionDates: [],
      startDate: '2026-09-01',
      endDate: '2026-09-03',
    });
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });
});
