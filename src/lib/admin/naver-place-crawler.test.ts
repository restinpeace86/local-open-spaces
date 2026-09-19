import { describe, expect, it } from 'vitest';
import {
  extractNaverPlaceId,
  buildNaverPlaceUrls,
  buildNaverPlaceFeedUrl,
  denormalizeApolloValue,
  parseApolloState,
  formatBusinessHoursText,
  formatMenuText,
  extractNaverPlaceCrawlResult,
  extractNaverPlaceFeedItems,
  type NaverPlaceBusinessHourDay,
} from './naver-place-crawler';

describe('extractNaverPlaceId', () => {
  it('map.naver.com/p/entry/place/ 형식에서 ID를 뽑는다(사용자가 제시한 예시)', () => {
    expect(
      extractNaverPlaceId(
        'https://map.naver.com/p/entry/place/36200306?lng=127.0901331&lat=37.3907624&placePath=%2Fmenu&entry=plt&searchType=place&c=15.00,0,0,0,dh'
      )
    ).toBe('36200306');
  });

  it('pcmap.place.naver.com/restaurant/ 형식에서도 뽑는다', () => {
    expect(extractNaverPlaceId('https://pcmap.place.naver.com/restaurant/36200306/home')).toBe('36200306');
  });

  it('ID를 찾을 수 없으면 null이다(추측 금지)', () => {
    expect(extractNaverPlaceId('https://map.naver.com/p/search/강남역')).toBeNull();
    expect(extractNaverPlaceId('')).toBeNull();
  });
});

describe('buildNaverPlaceUrls', () => {
  it('home/menu 두 URL을 정확히 만든다(사용자가 제시한 형식 그대로)', () => {
    expect(buildNaverPlaceUrls('36200306')).toEqual({
      homeUrl: 'https://pcmap.place.naver.com/restaurant/36200306/home',
      menuUrl: 'https://pcmap.place.naver.com/restaurant/36200306/menu/list',
    });
  });
});

describe('denormalizeApolloValue', () => {
  const state = {
    'Foo:1': { __typename: 'Foo', id: '1', name: '가게', photo: { __ref: 'Photo:1' } },
    'Photo:1': { __typename: 'Photo', url: 'https://example.com/a.jpg' },
  };

  it('{ __ref } 포인터를 실제 객체로 치환한다', () => {
    const resolved = denormalizeApolloValue(state, { __ref: 'Foo:1' }) as Record<string, unknown>;
    expect(resolved.name).toBe('가게');
    expect((resolved.photo as { url: string }).url).toBe('https://example.com/a.jpg');
  });

  it('배열 안의 ref도 재귀적으로 해결한다', () => {
    const resolved = denormalizeApolloValue(state, [{ __ref: 'Photo:1' }]) as Array<{ url: string }>;
    expect(resolved[0].url).toBe('https://example.com/a.jpg');
  });

  it('존재하지 않는 ref는 null로 처리한다(추측 금지)', () => {
    expect(denormalizeApolloValue(state, { __ref: 'Missing:1' })).toBeNull();
  });

  it('순환 참조가 있어도 무한루프에 빠지지 않는다', () => {
    const circular = { 'A:1': { __ref: 'B:1' }, 'B:1': { __ref: 'A:1' } };
    expect(denormalizeApolloValue(circular, { __ref: 'A:1' })).toBeNull();
  });
});

describe('parseApolloState', () => {
  it('window.__APOLLO_STATE__ 대입문에서 JSON을 파싱한다', () => {
    const html = `<script>window.__APOLLO_STATE__ = {"ROOT_QUERY":{"__typename":"Query"}};window.__OTHER__ = {};</script>`;
    expect(parseApolloState(html)).toEqual({ ROOT_QUERY: { __typename: 'Query' } });
  });

  it('__APOLLO_STATE__가 없으면 null이다(추측 금지 — 페이지 구조가 바뀌었을 때 정직하게 실패)', () => {
    expect(parseApolloState('<html></html>')).toBeNull();
  });

  it('JSON 파싱 자체가 실패하면 null이다', () => {
    const html = `<script>window.__APOLLO_STATE__ = {broken json;window.__OTHER__ = {};</script>`;
    expect(parseApolloState(html)).toBeNull();
  });
});

// [실측 스키마 그대로](2026-09-18, 라라코스트 동탄점 실제 페이지 직접 확인).
describe('formatBusinessHoursText', () => {
  it('같은 시간대의 요일을 하나로 묶고, 가장 많은 요일 그룹을 맨 앞에 둔다', () => {
    const days: NaverPlaceBusinessHourDay[] = [
      { day: '금', start: '11:30', end: '21:00', breakStart: '15:00', breakEnd: '16:00', description: null },
      { day: '토', start: '11:30', end: '21:00', breakStart: '15:00', breakEnd: '16:00', description: null },
      { day: '일', start: '11:30', end: '21:00', breakStart: '15:00', breakEnd: '16:00', description: null },
      { day: '월', start: null, end: null, breakStart: null, breakEnd: null, description: '정기휴무 (매주 월요일)' },
      { day: '화', start: '11:30', end: '21:00', breakStart: '15:00', breakEnd: '16:00', description: null },
      { day: '수', start: '11:30', end: '21:00', breakStart: '15:00', breakEnd: '16:00', description: null },
    ];
    const text = formatBusinessHoursText(days);
    expect(text).toContain('금, 토, 일, 화, 수 11:30 - 21:00');
    expect(text).toContain('브레이크타임 15:00 - 16:00');
    expect(text).toContain('월 정기휴무 (매주 월요일)');
    // parseOperatingHoursText가 첫 시간 범위를 메인으로 채택하므로, 영업일 그룹이
    // 휴무일 줄보다 앞에 와야 한다.
    expect(text!.indexOf('11:30 - 21:00')).toBeLessThan(text!.indexOf('정기휴무'));
  });

  it('빈 배열이면 null이다', () => {
    expect(formatBusinessHoursText([])).toBeNull();
  });

  it('요일마다 시간이 다르면 그룹을 나눠서 표시한다', () => {
    const days: NaverPlaceBusinessHourDay[] = [
      { day: '월', start: '09:00', end: '18:00', breakStart: null, breakEnd: null, description: null },
      { day: '토', start: '10:00', end: '15:00', breakStart: null, breakEnd: null, description: null },
    ];
    const text = formatBusinessHoursText(days);
    expect(text).toContain('월 09:00 - 18:00');
    expect(text).toContain('토 10:00 - 15:00');
  });
});

describe('formatMenuText', () => {
  it('가격이 있으면 "이름 가격원" 한 줄로 만든다(기존 parseMenuText 형식)', () => {
    const text = formatMenuText([{ name: '파스타', price: 8900, priceDisplayText: '8,900원', thumbnailUrl: null }]);
    expect(text).toBe('파스타 8,900원');
  });

  it('가격이 없으면(시가 등) 이름만 남긴다', () => {
    const text = formatMenuText([{ name: '오늘의 생선회', price: null, priceDisplayText: '시가', thumbnailUrl: null }]);
    expect(text).toBe('오늘의 생선회');
  });

  it('여러 항목은 줄바꿈으로 구분한다', () => {
    const text = formatMenuText([
      { name: '짜장면', price: 7000, priceDisplayText: '7,000원', thumbnailUrl: null },
      { name: '짬뽕', price: 9000, priceDisplayText: '9,000원', thumbnailUrl: null },
    ]);
    expect(text).toBe('짜장면 7,000원\n짬뽕 9,000원');
  });
});

// [통합 추출 테스트](2026-09-18): 실제 라라코스트 동탄점 페이지에서 실측한 것과 동일한
// 형태(축약)의 Apollo state 픽스처로 extractNaverPlaceCrawlResult 전체 흐름을 검증한다.
describe('extractNaverPlaceCrawlResult', () => {
  const PLACE_ID = '36200306';
  const homeState = {
    ROOT_QUERY: {
      __typename: 'Query',
      [`placeDetail({"input":{"deviceType":"pcmap","id":"${PLACE_ID}","isNx":false}})`]: {
        __typename: 'PlaceDetail',
        base: { __ref: `PlaceDetailBase:${PLACE_ID}` },
        newBusinessHours: [
          {
            __typename: 'NewBusinessHour',
            businessHours: [
              {
                __typename: 'WorkingHoursInfo',
                day: '금',
                businessHours: { __typename: 'StartEndTime', start: '11:30', end: '21:00' },
                breakHours: [{ __typename: 'StartEndTime', start: '15:00', end: '16:00' }],
                description: null,
              },
            ],
          },
        ],
        // [실측 스키마](2026-09-18, 라라코스트 동탄점 실제 페이지 직접 확인): topPhotos는
        // 배열이 아니라 { total, items: [...] } 형태다.
        topPhotos: {
          __typename: 'PlaceDetailTopPhotos',
          total: 2,
          items: [
            {
              __typename: 'PlaceDetailTopPhotoItem',
              mediaSource: 'visitor',
              originalUrl: 'https://example.com/visitor.jpg',
            },
            {
              __typename: 'PlaceDetailTopPhotoItem',
              mediaSource: 'business',
              originalUrl: 'https://example.com/business.jpg',
            },
          ],
        },
      },
    },
    [`PlaceDetailBase:${PLACE_ID}`]: {
      __typename: 'PlaceDetailBase',
      id: PLACE_ID,
      name: '라라코스트 동탄점',
      roadAddress: '경기 화성시 동탄구 동탄솔빛로 48 거택프라자',
      address: '경기 화성시 동탄구 반송동 217-6',
      phone: '031-8003-3270',
      category: '패밀리레스토랑',
      conveniences: ['주차'],
    },
    'PlaceMenuItem:1': {
      __typename: 'PlaceMenuItem',
      name: '파스타',
      price: { __typename: 'PlaceMenuPrice', displayText: '8,900원' },
      thumbnailUrl: 'https://example.com/pasta.jpg',
    },
  };

  function toHtml(state: Record<string, unknown>): string {
    return `<script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};window.__OTHER__ = {};</script>`;
  }

  it('업체 기본 정보(이름/주소/전화/카테고리/편의시설)를 뽑는다', () => {
    const result = extractNaverPlaceCrawlResult(PLACE_ID, toHtml(homeState), null);
    expect(result.name).toBe('라라코스트 동탄점');
    expect(result.roadAddress).toBe('경기 화성시 동탄구 동탄솔빛로 48 거택프라자');
    expect(result.phone).toBe('031-8003-3270');
    expect(result.category).toBe('패밀리레스토랑');
    expect(result.conveniences).toEqual(['주차']);
  });

  it('대표 이미지는 mediaSource가 business인 사진을 우선한다', () => {
    const result = extractNaverPlaceCrawlResult(PLACE_ID, toHtml(homeState), null);
    expect(result.representativeImageUrl).toBe('https://example.com/business.jpg');
  });

  it('영업시간 원시 데이터와 포맷된 텍스트를 함께 반환한다', () => {
    const result = extractNaverPlaceCrawlResult(PLACE_ID, toHtml(homeState), null);
    expect(result.businessHourDays).toHaveLength(1);
    expect(result.businessHoursFreeText).toContain('11:30 - 21:00');
  });

  it('메뉴 항목을 추출한다', () => {
    const result = extractNaverPlaceCrawlResult(PLACE_ID, toHtml(homeState), null);
    expect(result.menuItems).toEqual([
      { name: '파스타', price: 8900, priceDisplayText: '8,900원', thumbnailUrl: 'https://example.com/pasta.jpg' },
    ]);
  });

  it('home 페이지 파싱에 실패해도(null) 예외 없이 빈 값으로 안전하게 처리한다', () => {
    const result = extractNaverPlaceCrawlResult(PLACE_ID, null, null);
    expect(result.name).toBeNull();
    expect(result.menuItems).toEqual([]);
    expect(result.businessHoursFreeText).toBeNull();
  });

  it('menu 페이지에만 있는 메뉴도 병합한다(양쪽 다 있으면 이름 기준 중복 제거)', () => {
    const menuOnlyState = {
      'PlaceMenuItem:2': {
        __typename: 'PlaceMenuItem',
        name: '샐러드',
        price: { __typename: 'PlaceMenuPrice', displayText: '6,000원' },
        thumbnailUrl: null,
      },
    };
    const result = extractNaverPlaceCrawlResult(PLACE_ID, toHtml(homeState), toHtml(menuOnlyState));
    expect(result.menuItems.map((m) => m.name).sort()).toEqual(['샐러드', '파스타']);
  });

  // [배달의민족 메뉴 폴백 — 실측 확인](2026-09-19, 사용자가 실제 URL을 넣어보고 "메뉴가
  // 안돼"라고 지적해 라이브 페이지를 다시 받아 확인한 실제 사례): "딸부자 닭갈비 닭도리탕"
  // (placeId 1107293125)는 네이버에 자체 메뉴(PlaceMenuItem)를 등록하지 않고 배달의민족
  // 메뉴만 연동돼 있어, placeDetail.baemin.menuGroups[].menus[]에만 데이터가 있다(엔티티
  // 키 PlaceDetail_BaeminMenu:*, price는 문자열 "14000" 형태).
  describe('배달의민족 메뉴만 있는 업체(자체 메뉴 미등록)', () => {
    const BAEMIN_PLACE_ID = '1107293125';
    const baeminOnlyState = {
      ROOT_QUERY: {
        __typename: 'Query',
        [`placeDetail({"input":{"deviceType":"pcmap","id":"${BAEMIN_PLACE_ID}","isNx":false}})`]: {
          __typename: 'PlaceDetail',
          base: { __ref: `PlaceDetailBase:${BAEMIN_PLACE_ID}` },
          baemin: {
            __typename: 'PlaceDetail_BaeminData',
            menuGroups: [{ __ref: 'PlaceDetail_BaeminMenuGroup:14149059_0' }],
          },
        },
      },
      [`PlaceDetailBase:${BAEMIN_PLACE_ID}`]: {
        __typename: 'PlaceDetailBase',
        id: BAEMIN_PLACE_ID,
        name: '딸부자 닭갈비 닭도리탕',
      },
      'PlaceDetail_BaeminMenuGroup:14149059_0': {
        __typename: 'PlaceDetail_BaeminMenuGroup',
        order: 0,
        id: '14149059_0',
        name: '대표메뉴',
        menus: [{ __ref: 'PlaceDetail_BaeminMenu:1136425081' }],
      },
      'PlaceDetail_BaeminMenu:1136425081': {
        __typename: 'PlaceDetail_BaeminMenu',
        order: 1,
        id: '1136425081',
        name: '딸부자 닭갈비(1인분)',
        images: ['http://imagefarm.baemin.com/example.jpg'],
        price: '14000',
        orderType: 'DELIVERY',
        source: 'baemin',
      },
    };

    it('PlaceMenuItem이 하나도 없으면 배민 메뉴로 대체한다', () => {
      const result = extractNaverPlaceCrawlResult(BAEMIN_PLACE_ID, toHtml(baeminOnlyState), null);
      expect(result.menuItems).toEqual([
        {
          name: '딸부자 닭갈비(1인분)',
          price: 14000,
          priceDisplayText: '14,000원',
          thumbnailUrl: 'http://imagefarm.baemin.com/example.jpg',
        },
      ]);
    });

    it('자체 메뉴(PlaceMenuItem)가 하나라도 있으면 배민 메뉴는 무시한다(배달가/매장가 혼합 방지)', () => {
      const mixedState = {
        ...baeminOnlyState,
        'PlaceMenuItem:1': {
          __typename: 'PlaceMenuItem',
          name: '자체등록메뉴',
          price: { __typename: 'PlaceMenuPrice', displayText: '15,000원' },
          thumbnailUrl: null,
        },
      };
      const result = extractNaverPlaceCrawlResult(BAEMIN_PLACE_ID, toHtml(mixedState), null);
      expect(result.menuItems.map((m) => m.name)).toEqual(['자체등록메뉴']);
    });
  });
});

describe('buildNaverPlaceFeedUrl', () => {
  it('placeId로 공지(feed) URL을 만든다', () => {
    expect(buildNaverPlaceFeedUrl('1107293125')).toBe('https://pcmap.place.naver.com/restaurant/1107293125/feed');
  });
});

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): 실측 확인한 실제
// 스키마(딸부자 닭갈비 닭도리탕, placeId 1107293125) 그대로의 픽스처로 검증한다.
describe('extractNaverPlaceFeedItems', () => {
  function toFeedHtml(state: Record<string, unknown>): string {
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
