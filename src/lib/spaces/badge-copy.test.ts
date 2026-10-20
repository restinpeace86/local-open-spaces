import { describe, it, expect } from 'vitest';
import { getBadgeOneLiner, BADGE_ONE_LINERS } from './badge-copy';

describe('getBadgeOneLiner', () => {
  it('사전에 있는 라벨은 한 줄 문구를 돌려준다', () => {
    expect(getBadgeOneLiner('주차 완비')).toBe('주차공간이 넉넉해요');
  });

  it('사전에 없는 라벨은 null을 돌려준다(추측으로 문구를 지어내지 않음)', () => {
    expect(getBadgeOneLiner('존재하지않는라벨')).toBeNull();
  });

  it('주의/제한 성격의 경고 뱃지는 의도적으로 사전에 없다', () => {
    expect(getBadgeOneLiner('노키즈존/성인 전용')).toBeNull();
    expect(getBadgeOneLiner('안전펜스 없는 위험한 냇가/계곡')).toBeNull();
  });

  it('모든 문구는 빈 문자열이 아니다', () => {
    for (const [label, text] of Object.entries(BADGE_ONE_LINERS)) {
      expect(text.length, `label=${label}`).toBeGreaterThan(0);
    }
  });
});
