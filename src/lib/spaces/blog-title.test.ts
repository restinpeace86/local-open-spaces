import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractTitleFromHtml, truncateTitle, fetchBlogTitle, clearBlogTitleCache } from './blog-title';

describe('extractTitleFromHtml', () => {
  it('og:title이 있으면 그걸 우선 쓴다', () => {
    const html = `<html><head><meta property="og:title" content="우리 동네 키즈카페 다녀왔어요"><title>다른 제목</title></head></html>`;
    expect(extractTitleFromHtml(html)).toBe('우리 동네 키즈카페 다녀왔어요');
  });

  it('og:title이 없으면 <title> 태그를 쓴다', () => {
    const html = `<html><head><title>아이와 함께 간 박물관 후기</title></head></html>`;
    expect(extractTitleFromHtml(html)).toBe('아이와 함께 간 박물관 후기');
  });

  it('네이버 블로그 꼬리말(" : 닉네임 - 네이버 블로그")을 떼어낸다', () => {
    const html = `<html><head><title>주말 나들이 후기 : 엄마의하루 - 네이버 블로그</title></head></html>`;
    expect(extractTitleFromHtml(html)).toBe('주말 나들이 후기');
  });

  it('다른 플랫폼 꼬리말은 추측해서 떼어내지 않는다', () => {
    const html = `<html><head><title>우리집 육아일기 - 티스토리</title></head></html>`;
    expect(extractTitleFromHtml(html)).toBe('우리집 육아일기 - 티스토리');
  });

  it('title/og:title이 둘 다 없으면 null', () => {
    expect(extractTitleFromHtml('<html><head></head></html>')).toBeNull();
  });

  it('HTML 엔티티를 디코딩한다', () => {
    const html = `<html><head><title>엄마&amp;아이 나들이</title></head></html>`;
    expect(extractTitleFromHtml(html)).toBe('엄마&아이 나들이');
  });
});

describe('truncateTitle', () => {
  it('길이를 넘으면 자르고 ...을 붙인다', () => {
    expect(truncateTitle('가나다라마바사아자차카타파하가나다라마바사', 10)).toBe('가나다라마바사아자차...');
  });

  it('길이 안이면 그대로 둔다', () => {
    expect(truncateTitle('짧은 제목', 10)).toBe('짧은 제목');
  });
});

describe('fetchBlogTitle', () => {
  afterEach(() => {
    clearBlogTitleCache();
    vi.unstubAllGlobals();
  });

  it('fetch 성공 시 제목을 추출해 반환하고 캐싱한다(두 번째 호출은 fetch를 다시 하지 않음)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><head><title>캐시 테스트 제목</title></head></html>'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchBlogTitle('https://blog.naver.com/abc/123');
    const second = await fetchBlogTitle('https://blog.naver.com/abc/123');

    expect(first).toBe('캐시 테스트 제목');
    expect(second).toBe('캐시 테스트 제목');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetch가 실패하면 null을 반환한다(페이지가 깨지지 않도록)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const title = await fetchBlogTitle('https://blog.naver.com/xyz/456');
    expect(title).toBeNull();
  });

  it('응답이 ok=false면 null을 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }));

    const title = await fetchBlogTitle('https://blog.naver.com/404page');
    expect(title).toBeNull();
  });
});
