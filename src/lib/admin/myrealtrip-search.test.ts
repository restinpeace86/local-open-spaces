import { describe, expect, it } from 'vitest';
import { filterSearchItemsByAllKeywordTokens, mapSearchItemToCuratedItemPrefill, MyRealTripSearchItem } from './myrealtrip-search';

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

// [스팟 매칭 검색의 OR 검색 문제 수정](2026-09-16 사용자 지적: "검색조건이 &가
// 아니고 OR야 오키드 키즈카페 할경우 이것만 나오는게 아니고 키즈카페 모두다
// 나오는거같아") — 실측 재현(46건 중 [김포] 오키드 키즈카페 1건 + 무관한
// 남양주/구미/포항 등 키즈카페 다수)을 그대로 축소해 검증한다.
describe('filterSearchItemsByAllKeywordTokens', () => {
  const items: MyRealTripSearchItem[] = [
    buildItem({ gid: '1', itemName: '[김포] 오키드 키즈카페' }),
    buildItem({ gid: '2', itemName: '[남양주] 플레이킹덤 키즈카페' }),
    buildItem({ gid: '3', itemName: '[구미] 송정동 큐토피아 키즈카페' }),
  ];

  it('검색어의 모든 토큰을 상품명에 포함하는 결과만 남긴다', () => {
    const result = filterSearchItemsByAllKeywordTokens(items, '오키드 키즈카페');
    expect(result.map((i) => i.gid)).toEqual(['1']);
  });

  it('정확히 일치하는 결과가 하나도 없으면 원본 목록을 그대로 반환한다(전부 숨기지 않음)', () => {
    const result = filterSearchItemsByAllKeywordTokens(items, '전혀다른업체명');
    expect(result).toEqual(items);
  });

  it('빈 검색어면 원본 목록을 그대로 반환한다', () => {
    expect(filterSearchItemsByAllKeywordTokens(items, '  ')).toEqual(items);
  });
});

describe('mapSearchItemToCuratedItemPrefill', () => {
  // [마이링크 자동 생성](2026-09-16 후속 지시): booking_url은 호출부가 넘긴 값을
  // 그대로 쓴다 — 원본 productUrl이 아니라 /v1/mylink로 변환한 추적 링크가
  // 들어와야 클릭이 실제로 정산된다.
  it('제목/이미지는 검색 결과에서, 제휴링크는 호출부가 넘긴 값(마이링크)을 그대로 매핑한다', () => {
    expect(mapSearchItemToCuratedItemPrefill(buildItem(), 'https://myrealt.rip/qamObf')).toEqual({
      title: '[교토] 기온 게이샤 지구 야간 워킹 투어',
      image_url: 'https://example.com/img.jpg',
      booking_url: 'https://myrealt.rip/qamObf',
    });
  });
});
