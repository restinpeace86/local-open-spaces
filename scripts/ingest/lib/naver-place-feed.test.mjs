import { describe, expect, it } from 'vitest';
import { buildNaverPlaceFeedUrl, extractNaverPlaceFeedItems } from './naver-place-feed.mjs';

// [네이버 플레이스 공지 주간 배치](2026-09-25): src/lib/admin/naver-place-crawler.test.ts의
// 동일한 테스트를 그대로 옮겼다(이 파일이 그 TS 파일의 공지 관련 함수만 mjs로 옮긴 것이므로).

describe('buildNaverPlaceFeedUrl', () => {
  it('placeId로 공지(feed) URL을 만든다', () => {
    expect(buildNaverPlaceFeedUrl('1107293125')).toBe('https://pcmap.place.naver.com/restaurant/1107293125/feed');
  });
});

describe('extractNaverPlaceFeedItems', () => {
  function toFeedHtml(state) {
    return `<script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};window.__OTHER__ = {};</script>`;
  }

  it('실측 스키마 그대로의 공지 항목을 추출한다', () => {
    const state = {
      'Feed:1107293125_22121930': {
        __typename: 'Feed',
        id: '1107293125_22121930',
        feedId: 22121930,
        title: '추석연휴~정상영업 합니다~^^',
        desc: '추석연휴 정상영업 합니다~^^',
        category: '알림',
        isDeleted: false,
        isPinned: true,
        createdString: '20260907',
        media: [
          {
            __typename: 'FeedMedia',
            mediaType: 'IMAGE',
            thumbnail: 'https://ldb-phinf.pstatic.net/example.jpg',
          },
        ],
      },
    };

    const items = extractNaverPlaceFeedItems(toFeedHtml(state));
    expect(items).toEqual([
      {
        naverFeedId: '1107293125_22121930',
        title: '추석연휴~정상영업 합니다~^^',
        content: '추석연휴 정상영업 합니다~^^',
        category: '알림',
        imageUrl: 'https://ldb-phinf.pstatic.net/example.jpg',
        isPinned: true,
        postedAt: '20260907',
      },
    ]);
  });

  it('isDeleted=true인 공지는 제외한다(네이버 쪽에서 이미 삭제된 항목)', () => {
    const state = {
      'Feed:1107293125_1': {
        __typename: 'Feed',
        id: '1107293125_1',
        title: '삭제된 공지',
        desc: null,
        category: null,
        isDeleted: true,
        isPinned: false,
        createdString: '20260901',
        media: [],
      },
    };
    expect(extractNaverPlaceFeedItems(toFeedHtml(state))).toEqual([]);
  });

  it('media가 없는(텍스트만 있는) 공지는 imageUrl이 null이다', () => {
    const state = {
      'Feed:1107293125_2': {
        __typename: 'Feed',
        id: '1107293125_2',
        title: '텍스트 공지',
        desc: '사진 없는 공지입니다',
        category: '알림',
        isDeleted: false,
        isPinned: false,
        createdString: '20260901',
        media: [],
      },
    };
    const items = extractNaverPlaceFeedItems(toFeedHtml(state));
    expect(items[0].imageUrl).toBeNull();
  });

  it('__APOLLO_STATE__를 찾을 수 없으면(페이지 구조 변경 등) 빈 배열을 반환한다', () => {
    expect(extractNaverPlaceFeedItems('<html></html>')).toEqual([]);
  });

  it('html이 null이면 빈 배열을 반환한다', () => {
    expect(extractNaverPlaceFeedItems(null)).toEqual([]);
  });
});
