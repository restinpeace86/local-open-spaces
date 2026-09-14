import sharp from 'sharp';

// [Decision — 2026-09-15 사용자 지시] "여기말고도 다른거 이벤트 픽이라던가
// 이미지 사용하는것도 1400px보다 더 큰거 들어오면 1400px로 바꿔서 저장
// 하도록 해" — face-sticker-editor.tsx의 클라이언트 다운스케일(1400px)과
// 별개로, 서버 쪽에서도 업로드되는 모든 이미지를 동일한 상한으로 강제한다.
// 클라이언트 처리를 건너뛰거나 실패한 경우(구형 브라우저, 관리자 업로드
// 등)에도 항상 적용되도록 하기 위한 방어선이다. 이 저장소에는 사용자/관리자
// 업로드 경로가 mom-pick-post-images, spot-curation-images 두 버킷뿐이라
// (검색 확인) 두 라우트 모두 이 함수를 거치도록 한다.
export const STORAGE_IMAGE_MAX_LONG_SIDE = 1400;

// 원본이 이미 상한 이내면 재인코딩 없이 그대로 반환한다(불필요한 화질
// 손실/처리 비용을 피한다). GIF는 애니메이션 프레임을 보존해야 하므로
// { animated: true }로 열어 모든 프레임을 함께 리사이즈한다.
export async function resizeImageForStorage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const isGif = mimeType === 'image/gif';
  const image = sharp(buffer, isGif ? { animated: true } : undefined);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= STORAGE_IMAGE_MAX_LONG_SIDE && height <= STORAGE_IMAGE_MAX_LONG_SIDE) {
    return buffer;
  }

  return image
    .resize({
      width: STORAGE_IMAGE_MAX_LONG_SIDE,
      height: STORAGE_IMAGE_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();
}
