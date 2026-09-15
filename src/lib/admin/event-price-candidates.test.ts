import { describe, expect, it } from 'vitest';
import {
  buildBlogCandidate,
  buildDescriptionCandidate,
  buildOfficialSiteCandidate,
  buildRawFieldCandidate,
  extractAgeText,
  extractGenericPageText,
} from './event-price-candidates';

describe('extractAgeText', () => {
  it('연령 힌트 키워드가 있으면 주변 문맥을 짧게 잘라 반환한다', () => {
    const result = extractAgeText('본 프로그램은 미취학 아동은 참여가 어렵고 초등학생 이상만 가능합니다.');
    expect(result).toContain('초등학생');
  });

  it('연령 힌트 키워드가 없으면 null이다', () => {
    expect(extractAgeText('오늘 날씨가 참 좋습니다.')).toBeNull();
  });

  it('빈 문자열/null이면 null이다', () => {
    expect(extractAgeText('')).toBeNull();
    expect(extractAgeText(null)).toBeNull();
  });
});

describe('buildRawFieldCandidate (소스4: 정형 요금 필드)', () => {
  it('USE_FEE 필드가 있으면 found 상태로 필드명과 값을 담는다', () => {
    const result = buildRawFieldCandidate({ USE_FEE: '성인 5,000원 / 청소년 3,000원' });
    expect(result).toMatchObject({ source: 'raw_field', status: 'found', rawFieldName: 'USE_FEE', priceText: '성인 5,000원 / 청소년 3,000원' });
  });

  it('PARTCPT_EXPN_INFO 필드가 있으면 found 상태다', () => {
    const result = buildRawFieldCandidate({ PARTCPT_EXPN_INFO: '무료 (일부 재료비 별도)' });
    expect(result).toMatchObject({ source: 'raw_field', status: 'found', rawFieldName: 'PARTCPT_EXPN_INFO' });
  });

  it('알려진 요금 필드가 하나도 없으면 not_found다(추측으로 다른 필드를 채택하지 않음)', () => {
    const result = buildRawFieldCandidate({ SOME_OTHER_FIELD: '10,000원' });
    expect(result).toMatchObject({ source: 'raw_field', status: 'not_found', priceText: null });
  });

  it('raw_data가 null/배열/객체가 아니면 not_found다', () => {
    expect(buildRawFieldCandidate(null).status).toBe('not_found');
    expect(buildRawFieldCandidate(['x']).status).toBe('not_found');
    expect(buildRawFieldCandidate('text').status).toBe('not_found');
  });
});

describe('buildDescriptionCandidate (소스2: 원천 설명)', () => {
  it('설명에 가격 라벨이 있으면 found다', () => {
    const result = buildDescriptionCandidate('이용료: 15,000원. 초등학생 이상 참여 가능합니다.');
    expect(result.status).toBe('found');
    expect(result.priceText).toContain('15,000원');
  });

  it('설명이 없으면 not_found다', () => {
    expect(buildDescriptionCandidate(null).status).toBe('not_found');
    expect(buildDescriptionCandidate('').status).toBe('not_found');
  });

  it('설명은 있지만 가격/연령 신호가 전혀 없으면 not_found다', () => {
    const result = buildDescriptionCandidate('아름다운 공원에서 즐기는 가을 축제입니다.');
    expect(result.status).toBe('not_found');
  });
});

describe('buildBlogCandidate (소스1: 기존 블로그 큐레이션 결과 재사용)', () => {
  it('curated_blog_urls와 price_text가 이미 있으면 found다', () => {
    const result = buildBlogCandidate({ curatedBlogUrls: ['https://blog.naver.com/x'], existingPriceText: '성인 12,000원' });
    expect(result).toMatchObject({ source: 'blog', status: 'found', priceText: '성인 12,000원', sourceUrl: 'https://blog.naver.com/x' });
  });

  it('블로그 URL 자체가 없으면 not_found다(아직 블로그 큐레이션을 안 한 것)', () => {
    const result = buildBlogCandidate({ curatedBlogUrls: [], existingPriceText: null });
    expect(result.status).toBe('not_found');
  });

  it('블로그 URL은 있지만 price_text가 비어 있으면 not_found(링크는 그대로 노출)', () => {
    const result = buildBlogCandidate({ curatedBlogUrls: ['https://blog.naver.com/x'], existingPriceText: null });
    expect(result).toMatchObject({ status: 'not_found', sourceUrl: 'https://blog.naver.com/x' });
  });
});

describe('extractGenericPageText', () => {
  it('script/style/nav/header/footer를 제거하고 본문 텍스트만 남긴다', () => {
    const html = `
      <html><body>
        <nav>메뉴 링크들</nav>
        <header>사이트 헤더</header>
        <main><p>이용요금: 10,000원</p><p>초등학생 이상 이용 가능</p></main>
        <footer>저작권 안내</footer>
        <script>var x = 1;</script>
      </body></html>
    `;
    const text = extractGenericPageText(html);
    expect(text).toContain('이용요금');
    expect(text).toContain('10,000원');
    expect(text).not.toContain('메뉴 링크들');
    expect(text).not.toContain('사이트 헤더');
    expect(text).not.toContain('저작권 안내');
  });
});

describe('buildOfficialSiteCandidate (소스3: 공식 홈페이지 크롤링)', () => {
  it('페이지 텍스트에서 가격을 찾으면 found다', () => {
    const result = buildOfficialSiteCandidate({ sourceUrl: 'https://example.com', pageText: '참가비 20,000원' });
    expect(result).toMatchObject({ source: 'official_site', status: 'found', priceText: expect.stringContaining('20,000원') });
  });

  it('공식 URL 자체가 없으면 not_found다', () => {
    expect(buildOfficialSiteCandidate({ sourceUrl: null, pageText: null }).status).toBe('not_found');
  });

  it('크롤링 자체가 실패하면 error 상태와 사유를 담는다', () => {
    const result = buildOfficialSiteCandidate({ sourceUrl: 'https://example.com', pageText: null, errorMessage: 'HTTP 404' });
    expect(result).toMatchObject({ status: 'error', errorMessage: 'HTTP 404' });
  });

  it('크롤링은 성공했지만 가격/연령 신호가 없으면 not_found다', () => {
    const result = buildOfficialSiteCandidate({ sourceUrl: 'https://example.com', pageText: '회사 소개 페이지입니다.' });
    expect(result.status).toBe('not_found');
  });
});
