import { describe, expect, it } from 'vitest';
import { parseClosureText } from './2026-09-27-backfill-childrens-library-excluded-weekdays.mjs';

// [open_spaces 정기휴무 자동 채우기](2026-09-27 사용자 지시) — 실제 백필된 38건의
// operating_hours 문자열 전부를 고정 표본으로 검증한다(추측이 아니라 실측 문자열
// 그대로).
describe('parseClosureText', () => {
  it('매주 요일 + 일요일 제외 문구를 정확히 구분한다("제외"는 휴무가 아님)', () => {
    expect(parseClosureText('휴관일 매주 월요일 및 일요일을 제외한 법정공휴일')).toEqual({
      excludedWeekdays: ['MON'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(parseClosureText('휴관일 매주 월요일, 일요일을 제외한 법정공휴일')).toEqual({
      excludedWeekdays: ['MON'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(parseClosureText('휴관일 월요일, 법정공휴일 (일요일 제외), 임시휴관일')).toEqual({
      excludedWeekdays: ['MON'],
      excludedNthWeekdays: null,
      matched: true,
    });
  });

  it('"매주 {요일}요일" 형태를 정확히 뽑는다', () => {
    expect(parseClosureText('휴관일 매주 화요일, 법정공휴일')).toEqual({
      excludedWeekdays: ['TUE'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(parseClosureText('휴관일 매주 일요일, 법정공휴일')).toEqual({
      excludedWeekdays: ['SUN'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(parseClosureText('휴관일 매주 금요일 및 법정공휴일, 도서관 사정에 의한 임시 휴관일')).toEqual({
      excludedWeekdays: ['FRI'],
      excludedNthWeekdays: null,
      matched: true,
    });
  });

  it('"{요일}요일+법정공휴일"(접미사 있음, + 구분자)도 뽑는다', () => {
    expect(parseClosureText('평일 09:00~22:00, 주말 09:00~18:00, 휴관일 월요일+법정공휴일')).toEqual({
      excludedWeekdays: ['MON'],
      excludedNthWeekdays: null,
      matched: true,
    });
  });

  it('bare 한 글자 요일("월+법정공휴일", "토+일")을 뽑는다', () => {
    expect(parseClosureText('평일 09:00~18:00, 주말 09:00~17:00, 휴관일 월+법정 공휴일')).toEqual({
      excludedWeekdays: ['MON'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(parseClosureText('평일 10:00~13:00, 주말 00:00~00:00, 휴관일 토+일')).toEqual({
      excludedWeekdays: ['SAT', 'SUN'],
      excludedNthWeekdays: null,
      matched: true,
    });
    expect(
      parseClosureText('평일 09:00~18:00, 주말 09:00~17:00, 휴관일 일+공휴일+도서관 운영 필요에 따른 기관장이 정한 날')
    ).toEqual({ excludedWeekdays: ['SUN'], excludedNthWeekdays: null, matched: true });
  });

  it('"주말"은 토+일로 확장한다', () => {
    expect(
      parseClosureText('평일 09:00~17:00, 주말 00:00~00:00, 휴관일 도서관휴관일+주말+공휴일')
    ).toEqual({ excludedWeekdays: ['SAT', 'SUN'], excludedNthWeekdays: null, matched: true });
  });

  it('"매월 {순번} 주 {요일}요일"(주 있음)을 N번째 요일 토큰으로 뽑는다', () => {
    expect(
      parseClosureText('평일 09:00~18:00, 주말 09:00~17:00, 휴관일 둘째 주 월요일+넷째 주 월요일+법정공휴일')
    ).toEqual({ excludedWeekdays: null, excludedNthWeekdays: ['2-MON', '4-MON'], matched: true });
  });

  it('"매월 {순번}·{순번} {요일}요일"(주 없음, 순번 클러스터)도 뽑는다', () => {
    expect(
      parseClosureText('아침9시~저녁6시  야간도서관 자료이용 : [월~금요일] 18:00~21:00, 휴관일 매월 둘째·넷째 월요일, 공휴일')
    ).toEqual({ excludedWeekdays: null, excludedNthWeekdays: ['2-MON', '4-MON'], matched: true });
    expect(
      parseClosureText('휴관일 매월 첫째, 셋째 월요일, 일요일을 제외한 법정 공휴일(일요일과 공휴일이 겹칠 경우 휴관)')
    ).toEqual({ excludedWeekdays: null, excludedNthWeekdays: ['1-MON', '3-MON'], matched: true });
    expect(
      parseClosureText('평일 09:00~17:00, 주말 09:00~18:00, 휴관일 매월두번째월요일+법정공휴일')
    ).toEqual({ excludedWeekdays: null, excludedNthWeekdays: ['2-MON'], matched: true });
  });

  it('"연중무휴"는 확정된 무휴로 처리한다(파싱 실패와 구분)', () => {
    expect(parseClosureText('평일 08:00~18:00, 주말 00:00~23:59, 휴관일 연중무휴')).toEqual({
      excludedWeekdays: null,
      excludedNthWeekdays: null,
      matched: true,
    });
  });

  it('중첩된 "휴관일(매주 월요일)"까지 포함해 전부 뽑는다(실측: 판교어린이도서관 사례)', () => {
    expect(
      parseClosureText('평일 09:00~18:00, 주말 00:00~00:00, 휴관일 토+일+공휴일+휴관일(매주 월요일)')
    ).toEqual({ excludedWeekdays: ['MON', 'SAT', 'SUN'], excludedNthWeekdays: null, matched: true });
  });

  it('휴관일 표기 자체가 없으면 파싱 실패(matched: false)', () => {
    expect(parseClosureText('평일 09:00~18:00')).toEqual({ excludedWeekdays: null, excludedNthWeekdays: null, matched: false });
    expect(parseClosureText(null)).toEqual({ excludedWeekdays: null, excludedNthWeekdays: null, matched: false });
  });
});
