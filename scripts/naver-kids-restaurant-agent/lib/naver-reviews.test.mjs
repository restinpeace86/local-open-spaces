import { describe, it, expect } from 'vitest';
import { buildReviewUrl, extractKidGoodReviewBodies } from './naver-reviews.mjs';

function buildFixtureHtml(reviews) {
  const state = {};
  reviews.forEach((r, i) => {
    state[`VisitorReview:${i}`] = {
      __typename: 'VisitorReview',
      body: r.body,
      votedKeywords: r.votedKeywords ?? [],
    };
  });
  return `<html><script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script></html>`;
}

describe('buildReviewUrl', () => {
  it('placeId로 review URL을 만든다', () => {
    expect(buildReviewUrl('123')).toBe('https://pcmap.place.naver.com/restaurant/123/review/visitor');
  });
});

describe('extractKidGoodReviewBodies', () => {
  it('kid_good 태그가 있는 리뷰 본문만 추린다', () => {
    const html = buildFixtureHtml([
      { body: '아이와 가기 좋았어요, 아기의자도 있었어요', votedKeywords: [{ code: 'kid_good' }] },
      { body: '음식이 맛있어요', votedKeywords: [{ code: 'food_good' }] },
    ]);

    expect(extractKidGoodReviewBodies(html)).toEqual(['아이와 가기 좋았어요, 아기의자도 있었어요']);
  });

  it('kid_good 태그 리뷰가 없으면 빈 배열', () => {
    const html = buildFixtureHtml([{ body: '맛있어요', votedKeywords: [{ code: 'food_good' }] }]);
    expect(extractKidGoodReviewBodies(html)).toEqual([]);
  });

  it('body가 비거나 공백만이면 제외한다', () => {
    const html = buildFixtureHtml([
      { body: '   ', votedKeywords: [{ code: 'kid_good' }] },
      { body: undefined, votedKeywords: [{ code: 'kid_good' }] },
    ]);
    expect(extractKidGoodReviewBodies(html)).toEqual([]);
  });

  it('__APOLLO_STATE__가 없으면 빈 배열', () => {
    expect(extractKidGoodReviewBodies('<html></html>')).toEqual([]);
  });
});
