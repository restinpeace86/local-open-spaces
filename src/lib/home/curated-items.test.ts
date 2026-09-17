import { describe, expect, it } from 'vitest';
import { splitCuratedItemsByPeriod } from './curated-items';
import { CuratedItem } from '@/components/home/best-pick-slider';

function buildItem(overrides: Partial<CuratedItem> = {}): CuratedItem {
  return {
    id: 'c1',
    title: '숲속 키즈카페 이용권',
    image_url: null,
    booking_url: 'https://myrealt.rip/qx',
    category: 'ticket',
    is_active: true,
    operation_start_date: null,
    operation_end_date: null,
    created_at: '2026-09-17T00:00:00Z',
    ...overrides,
  };
}

// [제휴 상품 성격 이원화](2026-09-17 사용자 지시): operation_end_date 유무만으로
// 기간한정 특가 / 상시 티켓을 가른다.
describe('splitCuratedItemsByPeriod', () => {
  it('operation_end_date가 있으면 기간한정 특가로 분류한다', () => {
    const deal = buildItem({ id: 'deal-1', operation_end_date: '2026-10-31' });
    const result = splitCuratedItemsByPeriod([deal]);
    expect(result.limitedDeals.map((i) => i.id)).toEqual(['deal-1']);
    expect(result.evergreenTickets).toEqual([]);
  });

  it('operation_end_date가 없으면 상시 티켓으로 분류한다', () => {
    const evergreen = buildItem({ id: 'evergreen-1', operation_end_date: null });
    const result = splitCuratedItemsByPeriod([evergreen]);
    expect(result.evergreenTickets.map((i) => i.id)).toEqual(['evergreen-1']);
    expect(result.limitedDeals).toEqual([]);
  });

  it('여러 건이 섞여 있으면 각 그룹에 맞게 나눈다', () => {
    const deal = buildItem({ id: 'deal-1', operation_end_date: '2026-10-31' });
    const evergreen = buildItem({ id: 'evergreen-1', operation_end_date: null });
    const result = splitCuratedItemsByPeriod([deal, evergreen]);
    expect(result.limitedDeals.map((i) => i.id)).toEqual(['deal-1']);
    expect(result.evergreenTickets.map((i) => i.id)).toEqual(['evergreen-1']);
  });

  it('빈 배열이면 둘 다 빈 배열이다', () => {
    const result = splitCuratedItemsByPeriod([]);
    expect(result.limitedDeals).toEqual([]);
    expect(result.evergreenTickets).toEqual([]);
  });
});
