import { describe, expect, it } from 'vitest';
import { isToday, resolveThisSaturday, resolveThisSunday, resolveWhenChoice } from './date-resolver';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 실행 환경의 로컬 타임존과
// 무관하게 KST 기준으로 계산되는지 검증한다(`kma-base-time.test.mjs`와 동일한 관례) —
// 모든 `now` 인자는 UTC ISO 문자열로 명시한다(UTC = KST - 9시간). 2026-09-01은 실제
// 화요일, 09-05는 토요일, 09-06은 일요일(둘 다 node Date로 실측 확인).
describe('resolveThisSaturday/resolveThisSunday', () => {
  it('평일(화요일, KST 2026-09-01) 기준으로 이번 주 다가오는 토/일요일을 계산한다', () => {
    const tuesday = new Date('2026-08-31T15:00:00Z'); // KST 2026-09-01 00:00
    expect(resolveThisSaturday(tuesday).toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(resolveThisSunday(tuesday).toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('오늘이 토요일(KST 2026-09-05)이면 토요일=오늘, 일요일=내일이다', () => {
    const saturday = new Date('2026-09-04T15:00:00Z'); // KST 2026-09-05 00:00
    expect(resolveThisSaturday(saturday).toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(resolveThisSunday(saturday).toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('오늘이 일요일(KST 2026-09-06)이면 토요일=다음 주 토요일(과거로 되돌아가지 않음), 일요일=오늘이다', () => {
    const sunday = new Date('2026-09-05T15:00:00Z'); // KST 2026-09-06 00:00
    expect(resolveThisSaturday(sunday).toISOString().slice(0, 10)).toBe('2026-09-12');
    expect(resolveThisSunday(sunday).toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('실행 환경의 로컬 타임존 설정과 무관하게 UTC epoch 기준으로 동일한 결과를 낸다', () => {
    const epochMs = new Date('2026-08-31T15:00:00Z').getTime();
    expect(resolveThisSaturday(new Date(epochMs)).toISOString().slice(0, 10)).toBe('2026-09-05');
  });
});

describe('resolveWhenChoice', () => {
  const now = new Date('2026-08-31T15:00:00Z'); // KST 2026-09-01 00:00(화)

  it('TODAY/TOMORROW을 정확히 계산한다', () => {
    expect(resolveWhenChoice('TODAY', null, now)).toBe('2026-09-01');
    expect(resolveWhenChoice('TOMORROW', null, now)).toBe('2026-09-02');
  });

  it('THIS_SATURDAY/THIS_SUNDAY를 정확히 계산한다', () => {
    expect(resolveWhenChoice('THIS_SATURDAY', null, now)).toBe('2026-09-05');
    expect(resolveWhenChoice('THIS_SUNDAY', null, now)).toBe('2026-09-06');
  });

  it('CUSTOM은 유효한 YYYY-MM-DD 값을 그대로 반환한다', () => {
    expect(resolveWhenChoice('CUSTOM', '2026-09-20', now)).toBe('2026-09-20');
  });

  it('CUSTOM인데 값이 없거나 형식이 잘못되면 추측하지 않고 null을 반환한다', () => {
    expect(resolveWhenChoice('CUSTOM', null, now)).toBeNull();
    expect(resolveWhenChoice('CUSTOM', '2026/09/20', now)).toBeNull();
  });
});

describe('isToday', () => {
  it('KST 기준 오늘 날짜와 일치하면 true다', () => {
    const now = new Date('2026-08-31T15:00:00Z'); // KST 2026-09-01 00:00
    expect(isToday('2026-09-01', now)).toBe(true);
    expect(isToday('2026-09-02', now)).toBe(false);
  });

  it('KST 자정 근처(UTC로는 전날)에도 올바른 KST 날짜로 판정한다', () => {
    const lateNightUtc = new Date('2026-08-31T23:00:00Z'); // KST 2026-09-01 08:00
    expect(isToday('2026-09-01', lateNightUtc)).toBe(true);
  });
});
