import { describe, expect, it } from 'vitest';
import { extractBlogBodyText, MAX_BLOG_BODY_LENGTH, toMobileNaverBlogUrl } from './naver-blog-body';

// [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시) 단위 테스트.
describe('toMobileNaverBlogUrl', () => {
  it('blog.naver.com URL을 m.blog.naver.com으로 바꾼다(경로/쿼리 유지)', () => {
    expect(toMobileNaverBlogUrl('https://blog.naver.com/yjsjhs/223844311455')).toBe(
      'https://m.blog.naver.com/yjsjhs/223844311455'
    );
  });

  it('이미 m.blog.naver.com이면 그대로 반환한다', () => {
    expect(toMobileNaverBlogUrl('https://m.blog.naver.com/yjsjhs/223844311455')).toBe(
      'https://m.blog.naver.com/yjsjhs/223844311455'
    );
  });

  it('네이버 블로그가 아닌 URL(티스토리 등)은 추측하지 않고 null을 반환한다', () => {
    expect(toMobileNaverBlogUrl('https://example.tistory.com/1')).toBeNull();
  });

  it('URL 형식이 아니면 null을 반환한다(에러 없음)', () => {
    expect(toMobileNaverBlogUrl('not-a-url')).toBeNull();
  });
});

describe('extractBlogBodyText', () => {
  it('se-main-container(신형 스마트에디터) 안의 텍스트를 뽑아낸다', () => {
    const html = `
      <html><body>
        <div class="se-main-container">
          <div class="se-component se-text"><p>맛있는 숯불구이 후기입니다.</p></div>
          <script>console.log('무시돼야 함')</script>
          <div class="se-component se-text"><p>주차 공간도 넓었어요.</p></div>
        </div>
      </body></html>
    `;
    expect(extractBlogBodyText(html)).toBe('맛있는 숯불구이 후기입니다. 주차 공간도 넓었어요.');
  });

  it('postViewArea(구형 스마트에디터)로 폴백한다', () => {
    const html = `<html><body><div id="postViewArea"><p>구버전 본문입니다.</p></div></body></html>`;
    expect(extractBlogBodyText(html)).toBe('구버전 본문입니다.');
  });

  it('제로폭 공백을 제거하고 공백을 정리한다', () => {
    const html = `<html><body><div class="se-main-container"><p>첫줄​</p>\n<p>둘째줄</p></div></body></html>`;
    expect(extractBlogBodyText(html)).toBe('첫줄 둘째줄');
  });

  it('본문 컨테이너를 찾지 못하면 추측하지 않고 null을 반환한다', () => {
    const html = `<html><body><div class="something-else">내용</div></body></html>`;
    expect(extractBlogBodyText(html)).toBeNull();
  });

  it('과도하게 긴 본문은 MAX_BLOG_BODY_LENGTH로 자르고 말줄임표를 붙인다', () => {
    const longText = '가'.repeat(MAX_BLOG_BODY_LENGTH + 500);
    const html = `<html><body><div class="se-main-container"><p>${longText}</p></div></body></html>`;
    const result = extractBlogBodyText(html)!;
    expect(result.length).toBe(MAX_BLOG_BODY_LENGTH + '...'.length);
    expect(result.endsWith('...')).toBe(true);
  });
});
