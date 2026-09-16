import { describe, expect, it } from 'vitest';
import { mapSearchItemToCuratedItemPrefill, MyRealTripSearchItem } from './myrealtrip-search';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시)
function buildItem(overrides: Partial<MyRealTripSearchItem> = {}): MyRealTripSearchItem {
  return {
    gid: '5905493',
    itemName: '[교토] 기온 게이샤 지구 야간 워킹 투어',
    description: '오사카 ∙ 투어',
    salePrice: 36153,
    priceDisplay: '36,153원',
    category: '투어',
    reviewScore: 4.9,
    reviewCount: 302,
    imageUrl: 'https://example.com/img.jpg',
    productUrl: 'https://experiences.myrealtrip.com/products/5905493',
    deepLink: 'mrt://experiences/detail/5905493',
    tags: ['즉시 확정'],
    ...overrides,
  };
}

describe('mapSearchItemToCuratedItemPrefill', () => {
  it('제목/이미지/제휴링크를 curated_items 등록 폼에 채울 값으로 매핑한다', () => {
    expect(mapSearchItemToCuratedItemPrefill(buildItem())).toEqual({
      title: '[교토] 기온 게이샤 지구 야간 워킹 투어',
      image_url: 'https://example.com/img.jpg',
      booking_url: 'https://experiences.myrealtrip.com/products/5905493',
    });
  });
});
