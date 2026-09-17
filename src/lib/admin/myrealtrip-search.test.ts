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

  it('검색어의 모든 토큰을 상품명에 포함하는 결과만 남기고 exactMatchFound=true다', () => {
    const result = filterSearchItemsByAllKeywordTokens(items, '오키드 키즈카페');
    expect(result.items.map((i) => i.gid)).toEqual(['1']);
    expect(result.exactMatchFound).toBe(true);
  });

  // [실측 후속 발견](2026-09-16, "법동키즈카페로 검색하면 다나오는데?"): "법동"이
  // 마이리얼트립 검색 색인에 없는 지역명이라 AND 필터가 0건이 되는 게 정상이다 —
  // 이때 exactMatchFound=false로 "필터가 고장난 게 아니라 진짜 일치하는 게
  // 없다"는 걸 호출부가 구분할 수 있어야 한다.
  it('정확히 일치하는 결과가 하나도 없으면 원본 목록을 반환하되 exactMatchFound=false다', () => {
    const result = filterSearchItemsByAllKeywordTokens(items, '전혀다른업체명');
    expect(result.items).toEqual(items);
    expect(result.exactMatchFound).toBe(false);
  });

  it('빈 검색어면 원본 목록을 그대로 반환하고 exactMatchFound=true다', () => {
    const result = filterSearchItemsByAllKeywordTokens(items, '  ');
    expect(result.items).toEqual(items);
    expect(result.exactMatchFound).toBe(true);
  });
});

describe('mapSearchItemToCuratedItemPrefill', () => {
  // [마이링크 자동 생성](2026-09-16 후속 지시): booking_url은 호출부가 넘긴 값을
  // 그대로 쓴다 — 원본 productUrl이 아니라 /v1/mylink로 변환한 추적 링크가
  // 들어와야 클릭이 실제로 정산된다.
  it('제목/이미지/가격/gid는 검색 결과에서, 제휴링크는 호출부가 넘긴 값(마이링크)을 그대로 매핑한다', () => {
    expect(mapSearchItemToCuratedItemPrefill(buildItem(), 'https://myrealt.rip/qamObf')).toEqual({
      title: '[교토] 기온 게이샤 지구 야간 워킹 투어',
      image_url: 'https://example.com/img.jpg',
      booking_url: 'https://myrealt.rip/qamObf',
      price_display: '36,153원',
      description: null,
      myrealtrip_gid: '5905493',
    });
  });

  // [제휴 상품 성격 이원화](2026-09-17 사용자 지시): description은 검색 결과의
  // 짧은 카테고리 문구가 아니라 상세 조회 본문을 호출부가 명시적으로 넘긴다.
  it('상세 조회 설명을 넘기면 description에 그대로 담긴다', () => {
    const result = mapSearchItemToCuratedItemPrefill(buildItem(), 'https://myrealt.rip/qamObf', '<p>야간 투어 설명</p>');
    expect(result.description).toBe('<p>야간 투어 설명</p>');
  });
});
