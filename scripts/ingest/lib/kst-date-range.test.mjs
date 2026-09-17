import { describe, expect, it } from 'vitest';
import { kstDateStringToUtcIso, todayKstDateString, todayStartIsoKst } from './kst-date-range.mjs';

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
