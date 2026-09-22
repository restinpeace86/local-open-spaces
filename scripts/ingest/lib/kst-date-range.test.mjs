import { describe, expect, it } from 'vitest';
import { kstDateStringToUtcIso, kstNaiveDatetimeToUtcIso, todayKstDateString, todayStartIsoKst } from './kst-date-range.mjs';

// [실내/야외 분류 LLM 파이프라인 — 매일 신규분만](2026-09-17): src/lib/admin/
// kst-date-range.test.ts와 동일한 케이스를 이 .mjs 포트에도 그대로 검증한다.
describe('todayKstDateString', () => {
  it('KST 새벽 2시(UTC 전날 17:00)에도 KST 기준 오늘 날짜를 반환한다', () => {
    const utcInstant = new Date('2026-09-15T17:00:00.000Z');
    expect(todayKstDateString(utcInstant)).toBe('2026-09-16');
  });

  it('UTC와 KST가 같은 달력 날짜인 낮 시간대도 정확히 반환한다', () => {
    const utcInstant = new Date('2026-09-15T05:00:00.000Z');
    expect(todayKstDateString(utcInstant)).toBe('2026-09-15');
  });
});

describe('kstDateStringToUtcIso', () => {
  it('KST 자정을 그에 대응하는 UTC 순간(9시간 이전)으로 변환한다', () => {
    expect(kstDateStringToUtcIso('2026-09-15')).toBe('2026-09-14T15:00:00.000Z');
  });
});

describe('todayStartIsoKst', () => {
  it('KST 새벽 시간대에도 KST 자정을 오늘의 시작으로 계산한다', () => {
    const utcInstant = new Date('2026-09-15T17:00:00.000Z');
    expect(todayStartIsoKst(utcInstant)).toBe('2026-09-15T15:00:00.000Z');
  });
});

// [실측으로 발견한 타임존 버그 수정](2026-09-22): 서울시 공공서비스예약 API의
// RCPTBGNDT/RCPTENDDT 실제 값 형식("2026-08-25 09:00:00.0")으로 검증한다.
describe('kstNaiveDatetimeToUtcIso', () => {
  it('시간대 표시 없는 "YYYY-MM-DD HH:mm:ss.f" 문자열을 KST로 해석해 UTC로 변환한다', () => {
    // 실측: raw_data.RCPTBGNDT="2026-08-25 09:00:00.0"인데 이전엔 그대로
    // "2026-08-25T09:00:00+00:00"(UTC)으로 잘못 저장되고 있었다 — 올바른 값은
    // KST 09:00 = UTC 00:00.
    expect(kstNaiveDatetimeToUtcIso('2026-08-25 09:00:00.0')).toBe('2026-08-25T00:00:00.000Z');
  });

  it('소수점 초(.0) 없이 초 단위까지만 있어도 정상 변환한다', () => {
    expect(kstNaiveDatetimeToUtcIso('2026-07-22 10:00:00')).toBe('2026-07-22T01:00:00.000Z');
  });

  it('날짜가 바뀌는 경계(자정 근처)도 정확히 넘어간다', () => {
    // KST 00:00 = 전날 UTC 15:00.
    expect(kstNaiveDatetimeToUtcIso('2026-01-01 00:00:00.0')).toBe('2025-12-31T15:00:00.000Z');
  });

  it('null/빈 문자열/형식이 다른 값은 추측하지 않고 null을 반환한다', () => {
    expect(kstNaiveDatetimeToUtcIso(null)).toBeNull();
    expect(kstNaiveDatetimeToUtcIso('')).toBeNull();
    expect(kstNaiveDatetimeToUtcIso('알 수 없는 형식')).toBeNull();
  });
});
