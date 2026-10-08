import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { rehostCultureClubThumbnails, CULTURE_CLUB_THUMBNAIL_BUCKET } = await import('./rehost-culture-club-thumbnails.mjs');
const { fetchWithTimeout } = await import('./fetch-with-timeout.mjs');

// [문화센터 썸네일 재호스팅](2026-10-08 사용자 지시: "이미지 긁어오는거 우리
// 썸네일 규격이라던가 우리쪽 규격에 맞추는것도 하는거지?") —
// rehost-event-thumbnails.test.mjs와 동일한 검증 구조(제5장 제4조),
// raw_extra(JSONB) 안의 main_image_url만 갱신한다는 점만 다르다.
function makeClient({ rows, uploadError = null, updateError = null }) {
  const uploadMock = vi.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrlMock = vi.fn((path) => ({
    data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${CULTURE_CLUB_THUMBNAIL_BUCKET}/${path}` },
  }));
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));

  const selectBuilder = {
    select: () => selectBuilder,
    eq: () => selectBuilder,
    not: () => selectBuilder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };

  const client = {
    from: (table) => {
      if (table === 'culture_club_classes') {
        return { ...selectBuilder, update: updateMock };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: (path) => getPublicUrlMock(path),
      }),
    },
  };
  return { client, uploadMock, updateMock, updateEqMock };
}

function pngResponse() {
  // 1x1 투명 PNG.
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const buffer = Buffer.from(base64, 'base64');
  return {
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

describe('rehostCultureClubThumbnails', () => {
  afterEach(() => vi.clearAllMocks());

  it('raw_extra.main_image_url이 아직 외부 URL이면 다운로드해 리사이징 후 재호스팅하고, raw_extra의 다른 키는 보존한 채 main_image_url만 갱신한다', async () => {
    fetchWithTimeout.mockResolvedValue(pngResponse());
    const { client, uploadMock, updateMock, updateEqMock } = makeClient({
      rows: [{ id: 42, raw_extra: { main_image_url: 'https://sacademy.shinsegae.com/img.png', target_code: 'C1' } }],
    });

    const result = await rehostCultureClubThumbnails(client, { limit: 10 });

    expect(fetchWithTimeout).toHaveBeenCalledWith('https://sacademy.shinsegae.com/img.png', {}, expect.any(Number));
    expect(uploadMock).toHaveBeenCalledWith('42.webp', expect.any(Buffer), expect.objectContaining({ upsert: true }));
    expect(updateEqMock).toHaveBeenCalledWith('id', 42);
    expect(updateMock).toHaveBeenCalledWith({
      raw_extra: {
        target_code: 'C1',
        main_image_url: `https://project.supabase.co/storage/v1/object/public/${CULTURE_CLUB_THUMBNAIL_BUCKET}/42.webp`,
      },
    });
    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
  });

  // [원래 발견한 버그] culture.seoul.go.kr 등 일부 원본 서버가 비표준
  // `image/jpg`를 Content-Type으로 내려주는데, resizeThumbnail이 이제
  // 포맷을 무조건 WebP로 재인코딩하므로(2026-10-08 용량 최적화) 이
  // 입력값 자체가 최종 업로드 contentType에 영향을 주지 않는다 — 정규화
  // 버그가 구조적으로 재발할 수 없음을 함께 확인한다.
  it('원본이 비표준 image/jpg를 내려줘도 실패 없이 WebP로 재인코딩해 업로드한다', async () => {
    const jpegBuffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpg' },
      arrayBuffer: async () => jpegBuffer.buffer.slice(jpegBuffer.byteOffset, jpegBuffer.byteOffset + jpegBuffer.byteLength),
    });
    const { client, uploadMock } = makeClient({
      rows: [{ id: 1, raw_extra: { main_image_url: 'https://culture.lottemart.com/img.jpg' } }],
    });

    const result = await rehostCultureClubThumbnails(client, { limit: 10 });

    expect(uploadMock).toHaveBeenCalledWith('1.webp', expect.any(Buffer), expect.objectContaining({ contentType: 'image/webp' }));
    expect(result.succeeded).toBe(1);
  });

  it('원본 URL이 이미지가 아닌 응답(죽은 링크)을 반환하면 건너뛰고 원본을 그대로 둔다', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, headers: { get: () => 'text/html' } });
    const { client, updateMock } = makeClient({
      rows: [{ id: 1, raw_extra: { main_image_url: 'https://dead-link.example.com/gone.png' } }],
    });

    const result = await rehostCultureClubThumbnails(client, { limit: 10 });

    expect(updateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, succeeded: 0, failed: 0, skipped: 1 });
  });

  it('fetch 자체가 실패해도 해당 행만 실패 처리하고 나머지는 계속 진행한다', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(pngResponse());
    const { client } = makeClient({
      rows: [
        { id: 1, raw_extra: { main_image_url: 'https://broken.example.com/a.png' } },
        { id: 2, raw_extra: { main_image_url: 'https://ok.example.com/b.png' } },
      ],
    });

    const result = await rehostCultureClubThumbnails(client, { limit: 10 });

    expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1, skipped: 0 });
  });

  it('main_image_url 자체가 없는 행(예: 이마트 — main_image_key 방식이라 애초에 이 필드가 없음)은 조회 조건에서 걸러져 처리 대상에 없다', async () => {
    let capturedFilters = [];
    const client = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          not: (col, op, val) => {
            capturedFilters.push([col, op, val]);
            return builder;
          },
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return builder;
      },
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
    };

    const result = await rehostCultureClubThumbnails(client, { limit: 10 });

    expect(capturedFilters).toContainEqual(['raw_extra->>main_image_url', 'is', null]);
    expect(capturedFilters).toContainEqual([
      'raw_extra->>main_image_url',
      'ilike',
      `%/storage/v1/object/public/${CULTURE_CLUB_THUMBNAIL_BUCKET}/%`,
    ]);
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
  });
});
