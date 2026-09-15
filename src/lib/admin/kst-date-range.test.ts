import { describe, expect, it } from 'vitest';
import { kstDateStringToUtcIso, todayKstDateString, todayStartIsoKst } from './kst-date-range';

describe('todayKstDateString', () => {
  // [실측 재현] 이 버그의 핵심 사례 — UTC 기준 계산은 KST 새벽 시간대에 "어제" 날짜를
  // 반환한다. KST 02:00은 UTC로 전날 17:00이다.
  it('KST 새벽 2시(UTC 전날 17:00)에도 KST 기준 오늘 날짜를 반환한다', () => {
    const utcInstant = new Date('2026-09-15T17:00:00.000Z'); // = 2026-09-16 02:00 KST
    expect(todayKstDateString(utcInstant)).toBe('2026-09-16');
  });

  it('UTC와 KST가 같은 달력 날짜인 낮 시간대도 정확히 반환한다', () => {
    const utcInstant = new Date('2026-09-15T05:00:00.000Z'); // = 2026-09-15 14:00 KST
    expect(todayKstDateString(utcInstant)).toBe('2026-09-15');
  });
});

describe('kstDateStringToUtcIso', () => {
  it('KST 자정을 그에 대응하는 UTC 순간(9시간 이전)으로 변환한다', () => {
    expect(kstDateStringToUtcIso('2026-09-15')).toBe('2026-09-14T15:00:00.000Z');
  });
});

describe('todayStartIsoKst', () => {
  // [버그 재현 핵심] 기존 구현(new Date().toISOString() 기반)은 이 시각에 "오늘 시작"을
  // 2026-09-15T00:00:00.000Z로 계산해, KST로 이미 09-16 새벽인 지금 시점 기준
  // "어제"로 취급했다 — 그 결과 09-16 KST 00:00~09:00 사이에 생성된 행이 "오늘 신규"
  // 집계에서 누락됐다.
  it('KST 새벽 시간대에도 KST 자정을 오늘의 시작으로 계산한다(기존 UTC 자정 버그 수정)', () => {
    const utcInstant = new Date('2026-09-15T17:00:00.000Z'); // = 2026-09-16 02:00 KST
    expect(todayStartIsoKst(utcInstant)).toBe('2026-09-15T15:00:00.000Z'); // = 2026-09-16 00:00 KST
  });
});
