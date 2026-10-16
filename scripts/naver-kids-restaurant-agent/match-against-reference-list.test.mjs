import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const readCsvUtf8Mock = vi.fn();
const writeCsvUtf8Mock = vi.fn();
const mergeHeaderMock = vi.fn((rows, required) => required);
vi.mock('./lib/csv.mjs', () => ({
  readCsvUtf8: readCsvUtf8Mock,
  writeCsvUtf8: writeCsvUtf8Mock,
  mergeHeader: mergeHeaderMock,
}));

const pickBestCandidateMock = vi.fn();
vi.mock('./lib/address-match.mjs', () => ({ pickBestCandidate: pickBestCandidateMock }));

const { run, loadReferenceCandidates } = await import('./match-against-reference-list.mjs');

function writeFixturePage(dir, keyword, page, items) {
  const body = [{ data: { placeList: { businesses: { total: items.length, items } } } }];
  fs.writeFileSync(path.join(dir, `${keyword}_page${page}.json`), JSON.stringify(body), 'utf-8');
}

describe('loadReferenceCandidates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naverplace-ref-'));
  });

  it('여러 페이지 파일을 하나의 후보 배열로 합친다', () => {
    writeFixturePage(tmpDir, '유아숲체험원', 1, [
      { id: '1', name: 'A', roadAddress: 'ra', address: 'a', fullAddress: 'fa', x: '127.1', y: '37.1' },
    ]);
    writeFixturePage(tmpDir, '유아숲체험원', 2, [
      { id: '2', name: 'B', roadAddress: null, address: 'b', fullAddress: 'fb', x: '127.2', y: '37.2' },
    ]);

    const candidates = loadReferenceCandidates(tmpDir, '유아숲체험원');

    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.id === '1')).toMatchObject({ name: 'A', lng: 127.1, lat: 37.1 });
  });

  it('같은 id가 여러 페이지에 중복되면 한 번만 남긴다', () => {
    writeFixturePage(tmpDir, '유아숲체험원', 1, [{ id: '1', name: 'A', address: 'a', fullAddress: 'fa', x: '1', y: '1' }]);
    writeFixturePage(tmpDir, '유아숲체험원', 2, [{ id: '1', name: 'A', address: 'a', fullAddress: 'fa', x: '1', y: '1' }]);

    expect(loadReferenceCandidates(tmpDir, '유아숲체험원')).toHaveLength(1);
  });

  it('id나 name이 없는 항목은 제외한다', () => {
    writeFixturePage(tmpDir, '유아숲체험원', 1, [
      { id: '1', name: 'A', address: 'a', fullAddress: 'fa', x: '1', y: '1' },
      { id: null, name: 'B', address: 'b', fullAddress: 'fb', x: '1', y: '1' },
      { id: '3', name: '', address: 'c', fullAddress: 'fc', x: '1', y: '1' },
    ]);

    expect(loadReferenceCandidates(tmpDir, '유아숲체험원')).toHaveLength(1);
  });

  it('다른 키워드 파일은 무시한다', () => {
    writeFixturePage(tmpDir, '유아숲체험원', 1, [{ id: '1', name: 'A', address: 'a', fullAddress: 'fa', x: '1', y: '1' }]);
    writeFixturePage(tmpDir, '식당', 1, [{ id: '9', name: 'X', address: 'x', fullAddress: 'fx', x: '1', y: '1' }]);

    expect(loadReferenceCandidates(tmpDir, '유아숲체험원')).toHaveLength(1);
  });
});

describe('match-against-reference-list run()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naverplace-ref-'));
    readCsvUtf8Mock.mockReset();
    writeCsvUtf8Mock.mockReset();
    pickBestCandidateMock.mockReset();
    writeFixturePage(tmpDir, '유아숲체험원', 1, [
      { id: '777', name: '불암산 유아숲체험장', address: 'a', fullAddress: '서울 노원구 중계동', x: '127.08', y: '37.65' },
    ]);
  });

  it('이미 유효한 네이버플레이스ID가 있는 행은 건너뛴다', async () => {
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'A', 주소: 'a', 네이버플레이스ID: '123' }]);

    const stats = await run({ referenceDir: tmpDir });

    expect(stats.skipped).toBe(1);
    expect(pickBestCandidateMock).not.toHaveBeenCalled();
  });

  it('NOT_FOUND 행이 참고 목록과 매칭되면 ID/URL/네이버상호명을 채운다', async () => {
    const row = { 명칭: '불암산공원 유아숲체험원', 주소: '서울특별시 노원구 중계동 산 95-1', 네이버플레이스ID: 'NOT_FOUND' };
    readCsvUtf8Mock.mockReturnValue([row]);
    pickBestCandidateMock.mockReturnValue({ candidate: { id: '777', name: '불암산 유아숲체험장' } });

    const stats = await run({ referenceDir: tmpDir });

    expect(stats.matched).toBe(1);
    expect(row.네이버플레이스ID).toBe('777');
    expect(row.네이버상호명).toBe('불암산 유아숲체험장');
  });

  it('여전히 매칭되지 않으면 NOT_FOUND를 유지한다', async () => {
    const row = { 명칭: 'X', 주소: 'Y', 네이버플레이스ID: 'NOT_FOUND' };
    readCsvUtf8Mock.mockReturnValue([row]);
    pickBestCandidateMock.mockReturnValue(null);

    const stats = await run({ referenceDir: tmpDir });

    expect(stats.stillNotFound).toBe(1);
    expect(row.네이버플레이스ID).toBe('NOT_FOUND');
  });

  it('항상 CSV를 저장한다', async () => {
    readCsvUtf8Mock.mockReturnValue([{ 명칭: 'A', 주소: 'a', 네이버플레이스ID: '123' }]);

    await run({ referenceDir: tmpDir });

    expect(writeCsvUtf8Mock).toHaveBeenCalled();
  });
});
