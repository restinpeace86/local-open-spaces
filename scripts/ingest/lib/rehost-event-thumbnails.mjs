// [이벤트픽 성능 개선](2026-09-15 사용자 지시, implementation/todo.md [개선사항 1]):
// "원천데이터에서 제공하는 썸네일의 크기나 해상도가 우리 서비스가 정한 규격보다 클
// 경우, 업로드/동기화 시점에 우리 규격에 맞게 자동으로 리사이징 및 압축하여 저장" —
// events.thumbnail_url은 지금까지 원본 API의 외부 URL을 그대로 저장해 왔다(리사이징
// 없음, 우리 Storage로 재호스팅도 안 함). 이 함수는 아직 재호스팅되지 않은
// thumbnail_url(외부 URL)을 다운로드 → 300~400px(긴 변 기준 400px)로 리사이징 →
// 우리 Storage(event-thumbnails 버킷, public)에 업로드 → thumbnail_url을 우리
// URL로 교체한다.
//
// [배치 크기를 작게 유지] deactivate-expired-events.mjs와 같은 이유(대량 UPDATE
// 시 statement timeout 회피)에 더해, 이번엔 매 행마다 외부 네트워크 fetch가 추가로
// 들어가 훨씬 느리다 — 하루 배치 전체 실행 시간 예산을 넘지 않도록 기본 100건으로
// 제한한다. 전체 백로그(수만 건)는 매일 조금씩(하루 100건) 처리해 나가며, 이미
// 재호스팅된 행은 thumbnail_url이 우리 버킷 URL로 바뀌어 있어 다음 실행부터
// 자동으로 대상에서 빠진다(멱등적 — 같은 행을 반복 처리하지 않음).
import { fetchWithTimeout } from './fetch-with-timeout.mjs';
import { resizeThumbnail } from './resize-image.mjs';

export const EVENT_THUMBNAIL_BUCKET = 'event-thumbnails';
const DEFAULT_BATCH_SIZE = 100;
const FETCH_TIMEOUT_MS = 10000;

const EXTENSION_BY_FORMAT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };
// [실측 버그 수정] 원본 서버 중 일부(예: culture.seoul.go.kr)가 표준이 아닌
// `image/jpg`(정식 표준은 `image/jpeg`)를 Content-Type으로 내려준다 — 이 값을 그대로
// Storage 업로드의 contentType으로 넘기면 버킷의 allowed_mime_types 화이트리스트에
// 없는 값이라 "mime type image/jpg is not supported"로 전부 실패했다(3건 중 3건
// 재현 확인). 원본 서버가 뭐라고 주장하든 신뢰하지 않고, sharp가 실제 이미지 바이트를
// 디코딩해 판별한 포맷을 기준으로 표준 MIME 타입을 다시 만든다.
const MIME_TYPE_BY_FORMAT = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function isAlreadyHosted(url) {
  return url.includes(`/storage/v1/object/public/${EVENT_THUMBNAIL_BUCKET}/`);
}

// 반환값: { processed, succeeded, failed, skipped }. 개별 행 실패는 배치 전체를
// 막지 않고 건너뛴다(원천 URL이 죽어있거나 형식이 이상한 경우가 실제로 있다 —
// 이미지 하나 실패했다고 나머지 99건까지 못 돌게 하면 안 됨).
export async function rehostEventThumbnails(client, { limit = DEFAULT_BATCH_SIZE } = {}) {
  const { data: rows, error } = await client
    .from('events')
    .select('id, thumbnail_url')
    .not('thumbnail_url', 'is', null)
    .not('thumbnail_url', 'ilike', `%/storage/v1/object/public/${EVENT_THUMBNAIL_BUCKET}/%`)
    .limit(limit);
  if (error) throw new Error(`재호스팅 대상 이벤트 조회 실패: ${error.message}`);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows ?? []) {
    if (!row.thumbnail_url || isAlreadyHosted(row.thumbnail_url)) {
      skipped += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetchWithTimeout(row.thumbnail_url, {}, FETCH_TIMEOUT_MS);
      if (!res.ok) {
        failed += 1;
        continue;
      }
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        // 원본 URL이 이미지가 아닌 HTML 에러 페이지 등을 반환하는 경우(죽은 링크) —
        // 원본 URL을 그대로 둔다(잘못 덮어써서 아예 없애버리는 것보다 안전).
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
      const { error: uploadError } = await client.storage.from(EVENT_THUMBNAIL_BUCKET).upload(path, resized, {
        contentType: uploadContentType,
        upsert: true,
      });
      if (uploadError) {
        failed += 1;
        continue;
      }

      const { data: publicUrlData } = client.storage.from(EVENT_THUMBNAIL_BUCKET).getPublicUrl(path);
      // eslint-disable-next-line no-await-in-loop
      const { error: updateError } = await client
        .from('events')
        .update({ thumbnail_url: publicUrlData.publicUrl })
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
