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

describe('isTrustedBlogItem — 상호명은 항상 필수, 지역명은 알 때 추가로 확인', () => {
  it('상호명+지역명이 둘 다 제목이나 본문에 있으면 신뢰한다', () => {
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
        { title: '부산 플로렌스 글램핑 후기', link: 'x', description: '해운대 근처' },
        ['가평', '북면'],
        '플로렌스 글램핑'
      )
    ).toBe(false);
  });

  // [실사용 과잉교정 회귀 테스트](2026-10-16, 캐시 32건 전체 재검증 중 실측
  // 발견) — 상호명이 공백 없이 "용인어린이상상의숲"으로 저장돼 있어도, 사람이
  // 쓰는 블로그 글은 "용인어린이상상의 숲"처럼 중간에 띄어 쓰는 경우가 실제로
  // 있다. 충분히 길고 구체적인 이름은 공백 유무와 무관하게 포함되면 신뢰해야
  // 한다(짧은 이름만 단어 경계까지 확인).
  it('긴 상호명은 블로그 글의 띄어쓰기가 달라도(공백 유무) 신뢰한다', () => {
    expect(
      isTrustedBlogItem(
        { title: '용인 근교 아이랑 가볼만한 무료 실내놀이터', link: 'x', description: '용인어린이상상의 숲 다녀온 후기' },
        ['용인'],
        '용인어린이상상의숲'
      )
    ).toBe(true);
  });

  // [실사용 버그 회귀 테스트](2026-10-16 사용자 지적, 실측: 성남시 분당구
  // "위키(WIKI)" 키즈카페 사례) — 상호명 확인 없이 지역명만 보던 예전 로직은
  // "나무위키"/"위키인포"처럼 전혀 무관한 블로그가 본문에 "분당"/"성남"이
  // 우연히 섞여있다는 이유만으로 통과했다(실측: blog.naver.com/wiki-info/...
  // 실제 제목 "위키인포 : 네이버 블로그"). 상호명이 더 긴 무관한 단어 안에
  // 묻혀있는 경우(나무위키 속 "위키")까지 걸러져야 한다.
  it('상호명이 더 긴 무관한 단어 속에 묻혀있을 뿐이면 신뢰하지 않는다(나무위키/위키인포 사례)', () => {
    expect(
      isTrustedBlogItem(
        { title: '내가 궁금해서 만든 맛집 연예 나무위키', link: 'x', description: '성남 분당 맛집 정리' },
        ['성남', '분당'],
        '위키(WIKI)'
      )
    ).toBe(false);
    expect(
      isTrustedBlogItem({ title: '위키인포 : 네이버 블로그', link: 'x', description: '분당 소식' }, ['분당'], '위키(WIKI)')
    ).toBe(false);
  });

  it('상호명이 독립된 단어/구로 등장하면 신뢰한다(같은 괄호 영문 병기 상호명)', () => {
    expect(
      isTrustedBlogItem(
        { title: '분당 위키 키즈카페 다녀온 후기', link: 'x', description: '아이랑 놀기 좋아요' },
        ['분당'],
        '위키(WIKI)'
      )
    ).toBe(true);
  });

  it('지역명을 알아도 상호명이 아예 없으면 신뢰하지 않는다', () => {
    expect(
      isTrustedBlogItem({ title: '분당 맛집 추천 베스트 10', link: 'x', description: '여기도 가보세요' }, ['분당'], '위키(WIKI)')
    ).toBe(false);
  });

  it('지역명을 모르면(sigungu 없음) 상호명만으로 판정한다', () => {
    expect(isTrustedBlogItem({ title: '플로렌스 글램핑 후기', link: 'x', description: '' }, [], '플로렌스 글램핑')).toBe(
      true
    );
    expect(isTrustedBlogItem({ title: '전혀 다른 글', link: 'x', description: '' }, [], '플로렌스 글램핑')).toBe(false);
  });

  it('상호명이 너무 짧으면(1글자) 근거 부족으로 신뢰하지 않는다', () => {
    expect(isTrustedBlogItem({ title: '가평 A 캠핑 후기', link: 'x', description: '' }, ['가평'], 'A')).toBe(false);
  });
});

describe('selectTrustedBlogUrls', () => {
  const items = [
    { title: '가평 플로렌스 글램핑 후기', link: 'https://blog.naver.com/a', description: '' },
    { title: '서울 다른 캠핑', link: 'https://blog.naver.com/b', description: '' },
    { title: '가평 플로렌스 글램핑 다녀옴', link: 'https://blog.naver.com/c', description: '' },
    { title: '플로렌스 글램핑 가평점', link: 'https://blog.naver.com/d', description: '' },
    { title: '가평 다른 캠핑장', link: 'https://blog.naver.com/e', description: '' },
  ];

  it('신뢰도 검증을 통과한 URL만, 최대 3개 반환한다', () => {
    const urls = selectTrustedBlogUrls(items, ['가평'], '플로렌스 글램핑');
    expect(urls).toEqual(['https://blog.naver.com/a', 'https://blog.naver.com/c', 'https://blog.naver.com/d']);
    expect(urls.length).toBeLessThanOrEqual(BLOG_REVIEW_MAX);
  });

  it('중복 링크는 한 번만 담는다', () => {
    const dup = [items[0], items[0], items[2]];
    expect(selectTrustedBlogUrls(dup, ['가평'], '플로렌스 글램핑')).toEqual([
      'https://blog.naver.com/a',
      'https://blog.naver.com/c',
    ]);
  });

  it('통과 항목이 하나도 없으면 빈 배열', () => {
    expect(selectTrustedBlogUrls(items, ['제주'], '플로렌스 글램핑')).toEqual([]);
  });
});
