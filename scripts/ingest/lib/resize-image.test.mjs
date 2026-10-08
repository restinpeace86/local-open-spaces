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
  it('긴 변이 상한(400px)보다 큰 이미지는 상한 이내로 줄이고 WebP로 재인코딩한다', async () => {
    const original = await makePng(1600, 1200);
    const { buffer, format } = await resizeThumbnail(original, 'image/png');
    const meta = await sharp(buffer).metadata();

    expect(format).toBe('webp');
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
    expect(meta.height).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
    expect(meta.width / meta.height).toBeCloseTo(1600 / 1200, 1);
  });

  it('이미 상한 이내인 이미지도 용량 절감을 위해 WebP로 재인코딩한다(치수는 그대로 유지)', async () => {
    const original = await makePng(200, 150);
    const { buffer, format } = await resizeThumbnail(original, 'image/png');
    const meta = await sharp(buffer).metadata();

    expect(format).toBe('webp');
    expect(buffer).not.toBe(original);
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('GIF는 애니메이션 보존을 위해 포맷을 WebP로 바꾸지 않고 GIF로 유지한다', async () => {
    const frame = sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 20, b: 30 } },
    });
    const original = await frame.gif().toBuffer();
    const { buffer, format } = await resizeThumbnail(original, 'image/gif');

    expect(format).toBe('gif');
    expect(buffer).toBe(original);
  });

  it('상한보다 큰 GIF는 치수만 줄이고 포맷은 GIF로 유지한다', async () => {
    const frame = sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    });
    const original = await frame.gif().toBuffer();
    const { buffer, format } = await resizeThumbnail(original, 'image/gif');
    const meta = await sharp(buffer).metadata();

    expect(format).toBe('gif');
    expect(meta.width).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
    expect(meta.height).toBeLessThanOrEqual(EVENT_THUMBNAIL_MAX_LONG_SIDE);
  });
});
