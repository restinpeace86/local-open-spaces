// [찜한 이마트 강좌 상태 변화 알림](2026-10-06) — isNewlyActionable() 단위
// 테스트. lottemart-culture-club-status-watch.test.mjs와 동일한 패턴.
import { describe, expect, it } from 'vitest';
import { isNewlyActionable } from './emart-culture-club-status-watch.mjs';

describe('isNewlyActionable', () => {
  it('접수대기 → 접수중은 알림 대상이다', () => {
    expect(isNewlyActionable('접수대기', '접수중')).toBe(true);
  });

  it('접수마감 → 정원마감(대기 등록 가능)은 알림 대상이다', () => {
    expect(isNewlyActionable('접수마감', '정원마감')).toBe(true);
  });

  it('접수대기 → 정원마감은 알림 대상이다', () => {
    expect(isNewlyActionable('접수대기', '정원마감')).toBe(true);
  });

  it('접수중 → 접수마감(악화)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('접수중', '접수마감')).toBe(false);
  });

  it('접수대기 → 접수마감(둘 다 불가 상태끼리 전환)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('접수대기', '접수마감')).toBe(false);
  });

  it('정원마감 → 접수중(둘 다 이미 액션 가능한 상태끼리 전환)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('정원마감', '접수중')).toBe(false);
  });
});
