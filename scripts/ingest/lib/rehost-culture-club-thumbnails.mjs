// [문화센터 썸네일 재호스팅](2026-10-08 사용자 지시): "이미지 긁어오는거
// 우리 썸네일 규격이라던가 우리쪽 규격에 맞추는것도 하는거지?" —
// rehost-event-thumbnails.mjs와 동일한 설계(제5장 제4조 기존 구조 우선):
// culture_club_classes.raw_extra.main_image_url이 아직 외부 원천 URL이면
// 다운로드 → 리사이징(resizeThumbnail, events와 동일 규격 400px) → 우리
// Storage(culture-club-thumbnails 버킷)에 업로드 → main_image_url을 우리
// URL로 교체한다.
//
// [emart는 대상 아님] 이마트는 raw_extra.main_image_url이 아예 없다(대신
// main_image_key + 이미 동작 중인 CloudFront CDN 재구성 방식을 씀,
// culture-club-options.ts의 buildCultureClubThumbnailUrl 참고) — 쿼리
// 조건(raw_extra.main_image_url이 null이 아닌 행) 자체가 이마트 행을
// 자연히 걸러내므로 브랜드별 분기가 필요 없다.
//
// [raw_extra가 JSONB라 부분 갱신이 아니라 읽고-합쳐서-쓰기] events.
// thumbnail_url은 평범한 컬럼이라 그 값만 바로 UPDATE하면 됐지만, 여기는
// raw_extra 안의 한 키만 바꿔야 한다 — Supabase JS 클라이언트는 JSONB의
// 특정 키만 부분 갱신하는 연산자를 지원하지 않아, 이미 SELECT로 읽어온
// raw_extra 전체를 그대로 스프레드하고 main_image_url 키만 덮어써서
// 다시 통째로 쓴다(다른 키는 그대로 보존됨).
import { fetchWithTimeout } from './fetch-with-timeout.mjs';
import { resizeThumbnail } from './resize-image.mjs';

export const CULTURE_CLUB_THUMBNAIL_BUCKET = 'culture-club-thumbnails';
const DEFAULT_BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 10000;

const EXTENSION_BY_FORMAT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
const MIME_TYPE_BY_FORMAT = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function isAlreadyHosted(url) {
  return typeof url === 'string' && url.includes(`/storage/v1/object/public/${CULTURE_CLUB_THUMBNAIL_BUCKET}/`);
}

// 반환값: { processed, succeeded, failed, skipped }. 이벤트 썸네일 재호스팅과
// 동일하게 개별 행 실패(원천 URL이 죽어있거나 형식이 이상한 경우)가 배치
// 전체를 막지 않는다.
export async function rehostCultureClubThumbnails(client, { limit = DEFAULT_BATCH_SIZE } = {}) {
  const { data: rows, error } = await client
    .from('culture_club_classes')
    .select('id, raw_extra')
    .eq('is_excluded', false)
    .not('raw_extra->>main_image_url', 'is', null)
    .not('raw_extra->>main_image_url', 'ilike', `%/storage/v1/object/public/${CULTURE_CLUB_THUMBNAIL_BUCKET}/%`)
    .limit(limit);
  if (error) throw new Error(`재호스팅 대상 문화센터 강좌 조회 실패: ${error.message}`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    const sourceUrl = row.raw_extra?.main_image_url;
    if (!sourceUrl || isAlreadyHosted(sourceUrl)) {
      skipped += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchWithTimeout(sourceUrl, {}, FETCH_TIMEOUT_MS);
      if (!res.ok) {
        failed += 1;
        continue;
      }
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        // 원본 URL이 이미지가 아닌 응답(죽은 링크의 HTML 에러 페이지 등)을
        // 돌려주는 경우 — 원본 URL을 그대로 둔다(잘못 덮어써서 없애는 것보다 안전).
        skipped += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // eslint-disable-next-line no-await-in-loop
      const { buffer: resized, format } = await resizeThumbnail(buffer, contentType);
      const extension = EXTENSION_BY_FORMAT[format] ?? 'jpg';
      const path = `${row.id}.${extension}`;
      const uploadContentType = MIME_TYPE_BY_FORMAT[format] ?? 'image/jpeg';

      // eslint-disable-next-line no-await-in-loop
      const { error: uploadError } = await client.storage.from(CULTURE_CLUB_THUMBNAIL_BUCKET).upload(path, resized, {
        contentType: uploadContentType,
        upsert: true,
      });
      if (uploadError) {
        failed += 1;
        continue;
      }

      const { data: publicUrlData } = client.storage.from(CULTURE_CLUB_THUMBNAIL_BUCKET).getPublicUrl(path);
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client
        .from('culture_club_classes')
        .update({ raw_extra: { ...row.raw_extra, main_image_url: publicUrlData.publicUrl } })
        .eq('id', row.id);
      if (updateError) {
        failed += 1;
        continue;
      }
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: (rows ?? []).length, succeeded, failed, skipped };
}
