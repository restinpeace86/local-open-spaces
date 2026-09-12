import { describe, expect, it } from 'vitest';
import { isEventOperatingOn } from './event-operating-schedule';

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
});
