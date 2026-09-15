import sharp from 'sharp';

// [이벤트픽 성능 개선](2026-09-15 사용자 지시, implementation/todo.md [개선사항 1]):
// "일반 이미지 1400px, 썸네일 이미지 300~400px로 규격화" — src/lib/images/
// resize-for-storage.ts(사용자 업로드용, 1400px)와 같은 로직이지만 이 프로젝트의
// 배치 스크립트는 TypeScript 빌드 파이프라인 없이 순수 Node ESM으로 직접 실행되어
// `@/` 별칭으로 src/ 코드를 가져올 수 없다(scripts/ingest/lib/mom-pick-grade-calc.mjs
// 등 기존 배치 스크립트 전체가 동일한 이유로 독립 구현이다). 이 파일은 이벤트
// 썸네일 전용(300~400px, 긴 변 기준 400px)이다.
export const EVENT_THUMBNAIL_MAX_LONG_SIDE = 400;

// 원본이 이미 상한 이내면 재인코딩 없이 그대로 반환한다. GIF는 애니메이션 프레임을
// 보존해야 하므로 { animated: true }로 열어 모든 프레임을 함께 리사이즈한다.
export async function resizeThumbnail(buffer, mimeType) {
  const isGif = mimeType === 'image/gif';
  const image = sharp(buffer, isGif ? { animated: true } : undefined);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= EVENT_THUMBNAIL_MAX_LONG_SIDE && height <= EVENT_THUMBNAIL_MAX_LONG_SIDE) {
    return { buffer, format: metadata.format };
  }

  const resized = await image
    .resize({
      width: EVENT_THUMBNAIL_MAX_LONG_SIDE,
      height: EVENT_THUMBNAIL_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();
  return { buffer: resized, format: metadata.format };
}
