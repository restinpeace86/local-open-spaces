import sharp from 'sharp';

// [이벤트픽 성능 개선](2026-09-15 사용자 지시, implementation/todo.md [개선사항 1]):
// "일반 이미지 1400px, 썸네일 이미지 300~400px로 규격화" — src/lib/images/
// resize-for-storage.ts(사용자 업로드용, 1400px)와 같은 로직이지만 이 프로젝트의
// 배치 스크립트는 TypeScript 빌드 파이프라인 없이 순수 Node ESM으로 직접 실행되어
// `@/` 별칭으로 src/ 코드를 가져올 수 없다(scripts/ingest/lib/mom-pick-grade-calc.mjs
// 등 기존 배치 스크립트 전체가 동일한 이유로 독립 구현이다). 이 파일은 이벤트
// 썸네일 전용(300~400px, 긴 변 기준 400px)이다.
export const EVENT_THUMBNAIL_MAX_LONG_SIDE = 400;
// [썸네일 용량 추가 최적화](2026-10-08 사용자 지시: "최대한 썸네일 규격
// 최적화하고 줄여서 성능 끌어올려야지") — 치수(400px)만 제한하던 기존
// 방식에 더해, 포맷 자체를 WebP로 재인코딩해 동일 화질에서 JPEG/PNG보다
// 파일 용량을 추가로 줄인다. 두 저장 버킷(event-thumbnails/culture-club-
// thumbnails) 모두 image/webp를 허용 목록에 이미 포함하고 있어(실측
// 확인) 별도 마이그레이션 없이 바로 적용 가능하다.
const THUMBNAIL_WEBP_QUALITY = 80;

// GIF는 애니메이션 프레임을 보존해야 하므로 { animated: true }로 열어 모든
// 프레임을 함께 리사이즈하고, 포맷도 GIF로 유지한다(WebP 변환 시 애니메이션
// 프레임 보존 여부를 별도로 검증해야 해 범위를 넘어선다 — 추측 금지).
// 그 외 포맷(JPEG/PNG/WebP)은 치수가 상한 이내여도 WebP로 재인코딩해 용량을
// 줄인다.
export async function resizeThumbnail(buffer, mimeType) {
  const isGif = mimeType === 'image/gif';
  const image = sharp(buffer, isGif ? { animated: true } : undefined);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const needsResize = width > EVENT_THUMBNAIL_MAX_LONG_SIDE || height > EVENT_THUMBNAIL_MAX_LONG_SIDE;

  if (isGif) {
    if (!needsResize) return { buffer, format: metadata.format };
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

  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: EVENT_THUMBNAIL_MAX_LONG_SIDE,
      height: EVENT_THUMBNAIL_MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const encoded = await pipeline.webp({ quality: THUMBNAIL_WEBP_QUALITY }).toBuffer();
  return { buffer: encoded, format: 'webp' };
}
