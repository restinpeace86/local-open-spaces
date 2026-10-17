import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/load-env.mjs', () => ({ loadEnv: vi.fn() }));

const readCsvUtf8Mock = vi.fn();
vi.mock('./lib/csv.mjs', () => ({ readCsvUtf8: readCsvUtf8Mock }));

const rpcMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
vi.mock('../ingest/lib/supabase-admin.mjs', () => ({
  createAdminClient: () => ({
    rpc: rpcMock,
    from: () => ({ update: updateMock }),
  }),
}));

function mockDbRows(rows) {
  rpcMock.mockReturnValueOnce({ range: vi.fn().mockResolvedValue({ data: rows, error: null }) });
  rpcMock.mockReturnValueOnce({ range: vi.fn().mockResolvedValue({ data: [], error: null }) });
}

const { run } = await import('./write-back-naver-place-id.mjs');

describe('write-back-naver-place-id run()', () => {
  beforeEach(() => {
    readCsvUtf8Mock.mockReset();
    rpcMock.mockReset();
    updateMock.mockReset();
    eqMock.mockReset();
    updateMock.mockReturnValue({ eq: eqMock });
    eqMock.mockResolvedValue({ error: null });
  });

  it('숫자 ID가 있는 행만 DB에 반영한다(NOT_FOUND/빈 값은 건드리지 않음)', async () => {
    mockDbRows([{ id: 'db-1', name: 'A', lat: 37.1, lng: 127.1 }]);
    readCsvUtf8Mock.mockReturnValue([
      { 명칭: 'A', 위도: '37.1', 경도: '127.1', 네이버플레이스ID: '123' },
      { 명칭: 'B', 위도: '37.2', 경도: '127.2', 네이버플레이스ID: 'NOT_FOUND' },
      { 명칭: 'C', 위도: '37.3', 경도: '127.3', 네이버플레이스ID: '' },
    ]);

    const stats = await run();

    expect(stats.withNaverId).toBe(1);
    expect(stats.updated).toBe(1);
    expect(updateMock).toHaveBeenCalledWith({ naver_place_id: '123' });
    expect(eqMock).toHaveBeenCalledWith('id', 'db-1');
  });

  it('명칭+위도+경도로 DB 행을 찾지 못하면 매칭 실패로 집계한다(추측 금지)', async () => {
    mockDbRows([{ id: 'db-1', name: 'A', lat: 37.1, lng: 127.1 }]);
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'B', 위도: '99.9', 경도: '99.9', 네이버플레이스ID: '123' }]);

    const stats = await run();

    expect(stats.unmatched).toBe(1);
    expect(stats.unmatchedNames).toEqual(['B']);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('같은 명칭+위도+경도를 가진 DB 행이 둘 이상이면 매칭하지 않는다(근거 불충분)', async () => {
    mockDbRows([
      { id: 'db-1', name: 'A', lat: 37.1, lng: 127.1 },
      { id: 'db-2', name: 'A', lat: 37.1, lng: 127.1 },
    ]);
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'A', 위도: '37.1', 경도: '127.1', 네이버플레이스ID: '123' }]);

    const stats = await run();

    expect(stats.unmatched).toBe(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('DB 업데이트가 실패하면 failed로 집계하고 계속 진행한다', async () => {
    mockDbRows([{ id: 'db-1', name: 'A', lat: 37.1, lng: 127.1 }]);
    eqMock.mockResolvedValue({ error: { message: 'db error' } });
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'A', 위도: '37.1', 경도: '127.1', 네이버플레이스ID: '123' }]);

    const stats = await run();

    expect(stats.failed).toBe(1);
    expect(stats.updated).toBe(0);
  });
});
