import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./fetch-with-timeout.mjs', () => ({
  fetchWithTimeout: vi.fn(),
}));

const { rehostEventThumbnails, EVENT_THUMBNAIL_BUCKET } = await import('./rehost-event-thumbnails.mjs');
const { fetchWithTimeout } = await import('./fetch-with-timeout.mjs');

// [이벤트픽 성능 개선](2026-09-15, implementation/todo.md [개선사항 1]) — 외부
// thumbnail_url을 다운로드해 리사이징 후 우리 Storage로 재호스팅하는 로직 검증.
function makeClient({ rows, uploadError = null, updateError = null }) {
  const uploadMock = vi.fn().mockResolvedValue({ error: uploadError });
  const getPublicUrlMock = vi.fn((path) => ({
    data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/${EVENT_THUMBNAIL_BUCKET}/${path}` },
  }));
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn(() => ({ eq: updateEqMock }));

  const selectBuilder = {
    select: () => selectBuilder,
    not: () => selectBuilder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };

  const client = {
    from: (table) => {
      if (table === 'events') {
        return { ...selectBuilder, update: updateMock };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from: (bucket) => ({
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

describe('rehostEventThumbnails', () => {
  afterEach(() => vi.clearAllMocks());

  it('아직 우리 버킷 URL이 아닌 thumbnail_url을 다운로드해 리사이징 후 재호스팅하고 DB를 갱신한다', async () => {
    fetchWithTimeout.mockResolvedValue(pngResponse());
    const { client, uploadMock, updateEqMock } = makeClient({
      rows: [{ id: 'event-1', thumbnail_url: 'https://external.example.com/img.png' }],
    });

    const result = await rehostEventThumbnails(client, { limit: 10 });

    expect(fetchWithTimeout).toHaveBeenCalledWith('https://external.example.com/img.png', {}, expect.any(Number));
    expect(uploadMock).toHaveBeenCalledWith('event-1.png', expect.any(Buffer), expect.objectContaining({ upsert: true }));
    expect(updateEqMock).toHaveBeenCalledWith('id', 'event-1');
    expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
  });

  // [실측 버그 수정] culture.seoul.go.kr 등 일부 원본 서버가 비표준 `image/jpg`를
  // Content-Type으로 내려준다 — 이 값을 그대로 업로드에 넘기면 Storage의
  // allowed_mime_types 화이트리스트(image/jpeg만 허용)에 없어 전부 실패했다(실측
  // 3건 중 3건 재현). sharp가 실제로 디코딩한 포맷 기준으로 표준 MIME 타입을 다시
  // 만들어 넘겨야 한다.
  it('원본이 비표준 image/jpg를 내려줘도 표준 image/jpeg로 정규화해 업로드한다', async () => {
    const jpegBuffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    fetchWithTimeout.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpg' },
      arrayBuffer: async () => jpegBuffer.buffer.slice(jpegBuffer.byteOffset, jpegBuffer.byteOffset + jpegBuffer.byteLength),
    });
    const { client, uploadMock } = makeClient({
      rows: [{ id: 'event-1', thumbnail_url: 'https://culture.seoul.go.kr/img.jpg' }],
    });

    const result = await rehostEventThumbnails(client, { limit: 10 });

    expect(uploadMock).toHaveBeenCalledWith(
      'event-1.jpg',
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
    expect(result.succeeded).toBe(1);
  });

  it('원본 URL이 이미지가 아닌 응답(예: 죽은 링크의 HTML 에러 페이지)을 반환하면 건너뛰고 원본을 그대로 둔다', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, headers: { get: () => 'text/html' } });
    const { client, updateMock } = makeClient({
      rows: [{ id: 'event-1', thumbnail_url: 'https://dead-link.example.com/gone.png' }],
    });

    const result = await rehostEventThumbnails(client, { limit: 10 });

    expect(updateMock).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, succeeded: 0, failed: 0, skipped: 1 });
  });

  it('fetch 자체가 실패해도 해당 행만 실패 처리하고 나머지는 계속 진행한다', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(pngResponse());
    const { client } = makeClient({
      rows: [
        { id: 'event-1', thumbnail_url: 'https://broken.example.com/a.png' },
        { id: 'event-2', thumbnail_url: 'https://ok.example.com/b.png' },
      ],
    });

    const result = await rehostEventThumbnails(client, { limit: 10 });

    expect(result).toEqual({ processed: 2, succeeded: 1, failed: 1, skipped: 0 });
  });

  it('이미 우리 버킷 URL로 재호스팅된 행은 조회 조건 자체에서 제외된다(멱등성)', async () => {
    let capturedFilters = [];
    const client = {
      from: (table) => {
        expect(table).toBe('events');
        const builder = {
          select: () => builder,
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

    const result = await rehostEventThumbnails(client, { limit: 10 });

    expect(capturedFilters).toContainEqual(['thumbnail_url', 'ilike', `%/storage/v1/object/public/${EVENT_THUMBNAIL_BUCKET}/%`]);
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0, skipped: 0 });
  });
});
