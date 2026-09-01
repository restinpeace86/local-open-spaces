import { describe, expect, it } from 'vitest';
import { getLatestUltraSrtNcstBaseTime, getLatestVilageFcstBaseTime } from './kma-base-time.mjs';

// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시): getVilageFcst의
// 8회 발표 시각(02/05/08/11/14/17/20/23시 KST) 스케줄과 10분 반영 지연을 정확히
// 반영하는지 검증한다. 실행 환경의 로컬 타임존과 무관하게 항상 같은 결과가 나와야
// 하므로 UTC ISO 문자열로 기준 시각을 명시한다(UTC = KST - 9시간).
describe('getLatestVilageFcstBaseTime', () => {
  it('KST 09:15(발표 08시+65분 경과)이면 최신 발표는 08시다', () => {
    // KST 09:15 = UTC 00:15(같은 날)
    const result = getLatestVilageFcstBaseTime(new Date('2026-09-01T00:15:00Z'));
    expect(result).toEqual({ baseDate: '20260901', baseTime: '0800' });
  });

  it('발표 정각+10분 지연이 지나는 순간 해당 발표로 넘어간다(KST 02:10)', () => {
    // KST 02:10 = UTC 17:10(전날)
    const result = getLatestVilageFcstBaseTime(new Date('2026-08-31T17:10:00Z'));
    expect(result).toEqual({ baseDate: '20260901', baseTime: '0200' });
  });

  it('발표 정각은 지났지만 10분 지연 반영 전이면 아직 이전 발표를 쓴다(KST 02:05)', () => {
    // KST 02:05 = UTC 17:05(전날) → -10분 지연 적용 시 KST 01:55로 아직 02시 미만
    const result = getLatestVilageFcstBaseTime(new Date('2026-08-31T17:05:00Z'));
    expect(result).toEqual({ baseDate: '20260831', baseTime: '2300' });
  });

  it('KST 새벽 1시대(당일 02시 발표 전)는 전날 23시 발표를 쓴다', () => {
    // KST 2026-08-31 01:30 = UTC 2026-08-30 16:30
    const result = getLatestVilageFcstBaseTime(new Date('2026-08-30T16:30:00Z'));
    expect(result).toEqual({ baseDate: '20260830', baseTime: '2300' });
  });

  it('연도 경계를 정확히 넘긴다(KST 2026-01-01 00:05 → 2025-12-31 23시 발표)', () => {
    // KST 2026-01-01 00:05 = UTC 2025-12-31 15:05
    const result = getLatestVilageFcstBaseTime(new Date('2025-12-31T15:05:00Z'));
    expect(result).toEqual({ baseDate: '20251231', baseTime: '2300' });
  });

  it('실행 환경의 로컬 타임존 설정과 무관하게 UTC epoch 기준으로 동일한 결과를 낸다', () => {
    const epochMs = new Date('2026-09-01T00:15:00Z').getTime();
    const result = getLatestVilageFcstBaseTime(new Date(epochMs));
    expect(result).toEqual({ baseDate: '20260901', baseTime: '0800' });
  });
});

// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시) 요구사항 2 "선택적
// 적용": getUltraSrtNcst는 getVilageFcst와 달리 매시 정각 관측을 그 시각+10분경 반영한다
// (하루 8회가 아니라 매시간).
describe('getLatestUltraSrtNcstBaseTime', () => {
  it('정시+10분 지연이 지나면 그 정시가 최신 관측 기준시각이다', () => {
    // KST 09:15 = UTC 00:15
    const result = getLatestUltraSrtNcstBaseTime(new Date('2026-09-01T00:15:00Z'));
    expect(result).toEqual({ baseDate: '20260901', baseTime: '0900' });
  });

  it('정시는 지났지만 10분 지연 반영 전이면 이전 정시를 쓴다', () => {
    // KST 09:05 = UTC 00:05 → -10분 지연 적용 시 KST 08:55
    const result = getLatestUltraSrtNcstBaseTime(new Date('2026-09-01T00:05:00Z'));
    expect(result).toEqual({ baseDate: '20260901', baseTime: '0800' });
  });

  it('자정 경계를 넘긴다(KST 00:05 → 전날 23시)', () => {
    // KST 2026-09-01 00:05 = UTC 2026-08-31 15:05 → -10분 지연 시 전날 23:55
    const result = getLatestUltraSrtNcstBaseTime(new Date('2026-08-31T15:05:00Z'));
    expect(result).toEqual({ baseDate: '20260831', baseTime: '2300' });
  });
});
