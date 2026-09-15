import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resizeThumbnail, EVENT_THUMBNAIL_MAX_LONG_SIDE } from './resize-image.mjs';

// [이벤트픽 성능 개선](2026-09-15, implementation/todo.md [개선사항 1]) — src/lib/images/
// resize-for-storage.test.ts와 동일한 검증 방식(실제 sharp 합성 이미지, mock 없음).
async function makePng(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

describe('resizeThumbnail', () => {
  it('긴 변이 상한(400px)보다 큰 이미지는 상한 이내로 줄인다', async () => {
    const original = await makePng(1600, 1200);
    const { buffer } = await resizeThumbnail(original, 'image/png');
    const meta = await sharp(buffer).metadata();

    expect(meta.width).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
    expect(meta.height).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
    expect(meta.width / meta.height).toBeCloseTo(1600 / 1200, 1);
  });

  it('이미 상한 이내인 이미지는 재인코딩 없이 원본 그대로 반환한다', async () => {
    const original = await makePng(200, 150);
    const { buffer } = await resizeThumbnail(original, 'image/png');

    expect(buffer).toBe(original);
  });
});
