import { describe, it, expect } from 'vitest';
import { buildHomeUrl, extractConveniences } from './naver-place-detail.mjs';

function buildFixtureHtml(conveniences) {
  const state = {
    'PlaceDetailBase:123': { __typename: 'PlaceDetailBase', conveniences },
  };
  return `<html><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></html>`;
}

describe('buildHomeUrl', () => {
  it('placeId로 home URL을 만든다', () => {
    expect(buildHomeUrl('123')).toBe('https://pcmap.place.naver.com/restaurant/123/home');
  });
});

describe('extractConveniences', () => {
  it('PlaceDetailBase.conveniences 배열을 반환한다', () => {
    const html = buildFixtureHtml(['주차', '포장', '유아의자']);
    expect(extractConveniences(html)).toEqual(['주차', '포장', '유아의자']);
  });

  it('conveniences가 없으면 빈 배열', () => {
    const state = { 'PlaceDetailBase:123': { __typename: 'PlaceDetailBase' } };
    const html = `<html><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></html>`;
    expect(extractConveniences(html)).toEqual([]);
  });

  it('__APOLLO_STATE__가 없으면 빈 배열', () => {
    expect(extractConveniences('<html></html>')).toEqual([]);
  });

  it('html이 null이면 빈 배열', () => {
    expect(extractConveniences(null)).toEqual([]);
  });
});
