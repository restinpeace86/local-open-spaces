import { describe, expect, it } from 'vitest';
import { buildCultureClubThumbnailUrl } from './culture-club-options';

// [이미지 — 썸네일 CDN 확인됨](2026-10-03 사용자 제공 URL로 실측 확인): 두 가지 실제
// main_image_key 형태("category/4/403/{uuid}", "classImages/{uuid}") 모두에서
// https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/{key} 가 실제로 200 +
// JPEG를 반환함을 curl로 직접 확인했다. 이 함수는 그 URL 조합 로직만 검증한다.
describe('buildCultureClubThumbnailUrl', () => {
  it('"category/..." 형태 키로 올바른 CDN URL을 만든다', () => {
    expect(buildCultureClubThumbnailUrl('category/4/403/f1dcfa20-b0dc-4f75-890d-84eabb499b33')).toBe(
      'https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/category/4/403/f1dcfa20-b0dc-4f75-890d-84eabb499b33'
    );
  });

  it('"classImages/..." 형태 키로도 올바른 CDN URL을 만든다', () => {
    expect(buildCultureClubThumbnailUrl('classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31')).toBe(
      'https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31'
    );
  });

  it('키가 없으면(null/undefined) null을 반환한다(추측으로 이미지를 만들어내지 않음)', () => {
    expect(buildCultureClubThumbnailUrl(null)).toBeNull();
    expect(buildCultureClubThumbnailUrl(undefined)).toBeNull();
  });
});
