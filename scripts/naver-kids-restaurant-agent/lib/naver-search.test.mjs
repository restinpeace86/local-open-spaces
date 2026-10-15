import { describe, it, expect } from 'vitest';
import { extractSearchResults, buildSearchUrl } from './naver-search.mjs';

function buildFixtureHtml(items) {
  const state = {};
  for (const item of items) {
    state[`PlaceListBusinessesItem:${item.id}`] = {
      __typename: 'PlaceListBusinessesItem',
      id: item.id,
      name: item.name,
      category: item.category ?? '한식',
      roadAddress: item.roadAddress ?? null,
      address: item.address ?? null,
      fullAddress: item.fullAddress ?? null,
      x: item.x ?? null,
      y: item.y ?? null,
    };
  }
  return `<html><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></html>`;
}

describe('buildSearchUrl', () => {
  it('검색어를 URL 인코딩해 place/list 쿼리를 만든다', () => {
    const url = buildSearchUrl('원조남원추어탕');
    expect(url).toContain('pcmap.place.naver.com/place/list');
    expect(url).toContain(encodeURIComponent('원조남원추어탕'));
  });
});

describe('extractSearchResults', () => {
  it('PlaceListBusinessesItem 엔티티를 파싱해 결과 배열로 반환한다', () => {
    const html = buildFixtureHtml([
      {
        id: '36621594',
        name: '원조남원추어탕',
        roadAddress: '동서로10번길 3',
        address: '월곶동 643-8',
        fullAddress: '경기도 시흥시 동서로10번길 3',
        x: '126.7517258',
        y: '37.3899944',
      },
    ]);

    const results = extractSearchResults(html);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '36621594',
      name: '원조남원추어탕',
      fullAddress: '경기도 시흥시 동서로10번길 3',
      lng: 126.7517258,
      lat: 37.3899944,
    });
  });

  it('여러 결과가 있으면 전부 반환한다', () => {
    const html = buildFixtureHtml([
      { id: '1', name: '식당A' },
      { id: '2', name: '식당B' },
    ]);

    expect(extractSearchResults(html)).toHaveLength(2);
  });

  it('__APOLLO_STATE__가 없으면 빈 배열을 반환한다', () => {
    expect(extractSearchResults('<html>no data</html>')).toEqual([]);
  });

  it('html이 null이면 빈 배열을 반환한다', () => {
    expect(extractSearchResults(null)).toEqual([]);
  });
});
