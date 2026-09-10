import { describe, expect, it } from 'vitest';
import {
  BLOG_REVIEW_MAX,
  isBlogCacheFresh,
  isTrustedBlogItem,
  selectTrustedBlogUrls,
} from './blog-review-cache';

// [스팟픽 상세 카드 네이버 블로그 후기 캐싱(TTL)](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항2-7)
describe('isBlogCacheFresh', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  it('NULL(미조회)이면 fresh가 아니다', () => {
    expect(isBlogCacheFresh(null, now)).toBe(false);
    expect(isBlogCacheFresh(undefined, now)).toBe(false);
  });

  it('10일 이내면 fresh, 10일 초과면 stale', () => {
    expect(isBlogCacheFresh('2026-09-05T12:00:00Z', now)).toBe(true); // 5일 전
    expect(isBlogCacheFresh('2026-08-30T12:00:00Z', now)).toBe(false); // 11일 전
    expect(isBlogCacheFresh('2026-08-25T12:00:00Z', now)).toBe(false); // 16일 전
  });

  it('정확히 10일 경과는 fresh(경계 포함), 조금이라도 더 지나면 stale', () => {
    expect(isBlogCacheFresh('2026-08-31T12:00:00Z', now)).toBe(true); // 정확히 10일 전
    expect(isBlogCacheFresh('2026-08-31T11:59:00Z', now)).toBe(false); // 10일 하고 조금 더
  });

  it('미래 시각(시계 오차)은 fresh로 보지 않는다', () => {
    expect(isBlogCacheFresh('2026-09-20T12:00:00Z', now)).toBe(false);
  });

  it('잘못된 날짜 문자열이면 fresh가 아니다', () => {
    expect(isBlogCacheFresh('not-a-date', now)).toBe(false);
  });
});

describe('isTrustedBlogItem — 지역명/상호명이 제목·본문에 포함되어야 신뢰', () => {
  it('시군구 핵심 지역명이 제목이나 본문에 있으면 신뢰한다', () => {
    expect(
      isTrustedBlogItem(
        { title: '가평 플로렌스 글램핑 다녀왔어요', link: 'x', description: '북면에 있는' },
        ['가평', '북면'],
        '플로렌스 글램핑'
      )
    ).toBe(true);
  });

  it('지역명이 제목·본문 어디에도 없으면 신뢰하지 않는다(다른 지점 글 등)', () => {
    expect(
      isTrustedBlogItem(
        { title: '부산 다른 글램핑 후기', link: 'x', description: '해운대 근처' },
        ['가평', '북면'],
        '플로렌스 글램핑'
      )
    ).toBe(false);
  });

  it('공백이 껴 있어도 매칭한다', () => {
    expect(
      isTrustedBlogItem({ title: '가 평 캠핑', link: 'x', description: '' }, ['가평'], '아무개')
    ).toBe(true);
  });

  it('지역명을 모르면(sigungu 없음) 상호명이 제목·본문에 있는지로 대신 판정한다', () => {
    expect(isTrustedBlogItem({ title: '플로렌스 글램핑 후기', link: 'x', description: '' }, [], '플로렌스 글램핑')).toBe(
      true
    );
    expect(isTrustedBlogItem({ title: '전혀 다른 글', link: 'x', description: '' }, [], '플로렌스 글램핑')).toBe(false);
  });
});

describe('selectTrustedBlogUrls', () => {
  const items = [
    { title: '가평 A 캠핑 후기', link: 'https://blog.naver.com/a', description: '' },
    { title: '서울 다른 캠핑', link: 'https://blog.naver.com/b', description: '' },
    { title: '가평 C 글램핑', link: 'https://blog.naver.com/c', description: '' },
    { title: '가평 D', link: 'https://blog.naver.com/d', description: '' },
    { title: '가평 E', link: 'https://blog.naver.com/e', description: '' },
  ];

  it('신뢰도 검증을 통과한 URL만, 최대 3개 반환한다', () => {
    const urls = selectTrustedBlogUrls(items, ['가평'], 'A');
    expect(urls).toEqual(['https://blog.naver.com/a', 'https://blog.naver.com/c', 'https://blog.naver.com/d']);
    expect(urls.length).toBeLessThanOrEqual(BLOG_REVIEW_MAX);
  });

  it('중복 링크는 한 번만 담는다', () => {
    const dup = [items[0], items[0], items[2]];
    expect(selectTrustedBlogUrls(dup, ['가평'], 'A')).toEqual([
      'https://blog.naver.com/a',
      'https://blog.naver.com/c',
    ]);
  });

  it('통과 항목이 하나도 없으면 빈 배열', () => {
    expect(selectTrustedBlogUrls(items, ['제주'], 'A')).toEqual([]);
  });
});
