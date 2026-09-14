import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resizeImageForStorage, STORAGE_IMAGE_MAX_LONG_SIDE } from './resize-for-storage';

// [Decision — 2026-09-15 사용자 지시] "여기말고도 다른거 이벤트 픽이라던가
// 이미지 사용하는것도 1400px보다 더 큰거 들어오면 1400px로 바꿔서 저장
// 하도록 해" — 서버 쪽 강제 다운스케일 유틸리티 검증. 실제 sharp로 합성
// 이미지를 만들어(mock 없이) 진짜 리사이즈 동작을 확인한다.
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

describe('resizeImageForStorage', () => {
  it('긴 변이 상한(1400px)보다 큰 이미지는 상한 이내로 줄인다', async () => {
    const original = await makePng(3000, 2000);
    const resized = await resizeImageForStorage(original, 'image/png');
    const meta = await sharp(resized).metadata();

    expect(meta.width).toBeLessThanOrEqual(STORAGE_IMAGE_MAX_LONG_SIDE);
    expect(meta.height).toBeLessThanOrEqual(STORAGE_IMAGE_MAX_LONG_SIDE);
    // 원본 가로세로 비율(3:2)을 유지해야 한다.
    expect(meta.width! / meta.height!).toBeCloseTo(3000 / 2000, 1);
  });

  it('세로로 긴 이미지도 긴 변 기준으로 상한 이내로 줄인다', async () => {
    const original = await makePng(1000, 3000);
    const resized = await resizeImageForStorage(original, 'image/png');
    const meta = await sharp(resized).metadata();

    expect(meta.height).toBeLessThanOrEqual(STORAGE_IMAGE_MAX_LONG_SIDE);
    expect(meta.width).toBeLessThanOrEqual(STORAGE_IMAGE_MAX_LONG_SIDE);
  });

  it('이미 상한 이내인 이미지는 재인코딩 없이 원본 그대로 반환한다', async () => {
    const original = await makePng(800, 600);
    const resized = await resizeImageForStorage(original, 'image/png');

    expect(resized).toBe(original);
  });

  it('상한과 정확히 같은 크기는 그대로 반환한다(확대하지 않음)', async () => {
    const original = await makePng(STORAGE_IMAGE_MAX_LONG_SIDE, STORAGE_IMAGE_MAX_LONG_SIDE);
    const resized = await resizeImageForStorage(original, 'image/png');

    expect(resized).toBe(original);
  });
});
