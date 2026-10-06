// [찜한 문화센터 강좌 상태 변화 알림 — 통합] isNewlyActionable() 단위 테스트.
// 브랜드마다 "액션 가능" 집합이 다르므로 집합을 매개변수로 받는다.
import { describe, expect, it } from 'vitest';
import { isNewlyActionable } from './culture-club-status-watch.mjs';

const EMART_ACTIONABLE = new Set(['접수중', '정원마감']);
const LOTTEMART_ACTIONABLE = new Set(['바로신청', '대기자신청']);

describe('isNewlyActionable', () => {
  it('이마트: 접수대기 → 접수중은 알림 대상이다', () => {
    expect(isNewlyActionable(EMART_ACTIONABLE, '접수대기', '접수중')).toBe(true);
  });

  it('이마트: 접수중 → 접수마감(악화)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable(EMART_ACTIONABLE, '접수중', '접수마감')).toBe(false);
  });

  it('롯데마트: 접수마감 → 바로신청은 알림 대상이다', () => {
    expect(isNewlyActionable(LOTTEMART_ACTIONABLE, '접수마감', '바로신청')).toBe(true);
  });

  it('롯데마트: 대기자신청 → 바로신청(둘 다 이미 액션 가능)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable(LOTTEMART_ACTIONABLE, '대기자신청', '바로신청')).toBe(false);
  });
});
