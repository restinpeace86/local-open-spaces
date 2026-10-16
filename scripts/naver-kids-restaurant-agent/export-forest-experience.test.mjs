import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../lib/load-env.mjs', () => ({ loadEnv: vi.fn() }));

const rpcMock = vi.fn();
function mockRpcResult(result) {
  rpcMock.mockReturnValue({ range: vi.fn().mockResolvedValue(result) });
}
vi.mock('../ingest/lib/supabase-admin.mjs', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

const { run } = await import('./export-forest-experience.mjs');

describe('export-forest-experience', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `유아숲체험원-test-${Date.now()}.csv`);
    rpcMock.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('RPC 결과를 명칭/주소/위도/경도 4개 컬럼 CSV로 저장한다', async () => {
    mockRpcResult({
      data: [{ id: '1', name: '불암산 유아숲체험원', address: '서울 노원구 상계동', lng: 127.07, lat: 37.66 }],
      error: null,
    });

    const result = await run({ outputPath: tmpFile });

    expect(result.count).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith('get_open_spaces_by_category_min', { p_category_min: '유아숲체험원' });

    const written = fs.readFileSync(tmpFile, 'utf-8');
    const lines = written.trim().split('\r\n');
    expect(lines[0]).toBe('명칭,주소,위도,경도');
    expect(lines[1]).toBe('불암산 유아숲체험원,서울 노원구 상계동,37.66,127.07');
  });

  it('RPC가 에러를 반환하면 예외를 던진다', async () => {
    mockRpcResult({ data: null, error: { message: '권한 없음' } });

    await expect(run({ outputPath: tmpFile })).rejects.toThrow('권한 없음');
  });

  it('name/address가 null이면 빈 문자열로 채운다', async () => {
    mockRpcResult({ data: [{ id: '1', name: null, address: null, lng: null, lat: null }], error: null });

    await run({ outputPath: tmpFile });

    const written = fs.readFileSync(tmpFile, 'utf-8');
    const lines = written.trim().split('\r\n');
    expect(lines[1]).toBe(',,,');
  });

  it('1,000건을 넘으면 페이지네이션으로 전부 가져온다', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, name: `시설${i}`, address: 'a', lng: 1, lat: 1 }));
    const page2 = [{ id: '1000', name: '시설1000', address: 'a', lng: 1, lat: 1 }];
    rpcMock
      .mockReturnValueOnce({ range: vi.fn().mockResolvedValue({ data: page1, error: null }) })
      .mockReturnValueOnce({ range: vi.fn().mockResolvedValue({ data: page2, error: null }) });

    const result = await run({ outputPath: tmpFile });

    expect(result.count).toBe(1001);
  });
});
