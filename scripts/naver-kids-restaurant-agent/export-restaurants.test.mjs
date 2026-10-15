import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../lib/load-env.mjs', () => ({ loadEnv: vi.fn() }));

const rpcMock = vi.fn();
// get_open_spaces_by_category_min은 PostgREST 1,000행 truncation 방어를 위해
// .rpc(...).range(...) 체이닝으로 호출된다(export-restaurants.mjs 참고) — rpc()가
// range()를 가진 객체를 반환하도록 모킹한다.
function mockRpcResult(result) {
  rpcMock.mockReturnValue({ range: vi.fn().mockResolvedValue(result) });
}
vi.mock('../ingest/lib/supabase-admin.mjs', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

const { run } = await import('./export-restaurants.mjs');

describe('export-restaurants', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `식당-test-${Date.now()}.csv`);
    rpcMock.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it('RPC 결과를 명칭/주소/위도/경도 4개 컬럼 CSV로 저장한다', async () => {
    mockRpcResult({
      data: [
        { id: '1', name: '원조남원추어탕', address: '서울 강남구 테헤란로 1', lng: 127.1, lat: 37.5 },
      ],
      error: null,
    });

    const result = await run({ outputPath: tmpFile });

    expect(result.count).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith('get_open_spaces_by_category_min', { p_category_min: '식당' });

    const written = fs.readFileSync(tmpFile, 'utf-8');
    const lines = written.trim().split('\r\n');
    expect(lines[0]).toBe('명칭,주소,위도,경도');
    expect(lines[1]).toBe('원조남원추어탕,서울 강남구 테헤란로 1,37.5,127.1');
  });

  it('주소에 쉼표가 있으면 겹따옴표로 감싼다', async () => {
    mockRpcResult({
      data: [{ id: '1', name: '테스트식당', address: '서울 강남구 테헤란로 1, 2층', lng: 127.1, lat: 37.5 }],
      error: null,
    });

    await run({ outputPath: tmpFile });

    const written = fs.readFileSync(tmpFile, 'utf-8');
    expect(written).toContain('"서울 강남구 테헤란로 1, 2층"');
  });

  it('RPC가 에러를 반환하면 예외를 던진다', async () => {
    mockRpcResult({ data: null, error: { message: '권한 없음' } });

    await expect(run({ outputPath: tmpFile })).rejects.toThrow('권한 없음');
  });

  it('name/address가 null이면 빈 문자열로 채운다', async () => {
    mockRpcResult({
      data: [{ id: '1', name: null, address: null, lng: null, lat: null }],
      error: null,
    });

    await run({ outputPath: tmpFile });

    const written = fs.readFileSync(tmpFile, 'utf-8');
    const lines = written.trim().split('\r\n');
    expect(lines[1]).toBe(',,,');
  });
});
