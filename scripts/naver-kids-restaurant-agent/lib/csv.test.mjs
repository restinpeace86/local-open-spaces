import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readCsvUtf8, writeCsvUtf8, mergeHeader } from './csv.mjs';

describe('mergeHeader', () => {
  it('기존 행이 없으면 요구 컬럼 그대로 반환한다', () => {
    expect(mergeHeader([], ['명칭', '주소'])).toEqual(['명칭', '주소']);
  });

  it('기존 컬럼 순서를 보존하고, 없는 요구 컬럼만 뒤에 추가한다', () => {
    const existingRows = [{ 명칭: 'a', 주소: 'b', 네이버플레이스ID: 'c' }];
    const result = mergeHeader(existingRows, ['명칭', '주소', '네이버플레이스ID', '아기의자']);
    expect(result).toEqual(['명칭', '주소', '네이버플레이스ID', '아기의자']);
  });

  it('이미 모든 요구 컬럼이 있으면 기존 순서를 그대로 유지한다(다른 단계가 추가한 뒤쪽 컬럼도 보존)', () => {
    const existingRows = [{ 명칭: 'a', 주소: 'b', 네이버플레이스ID: 'c', 아기의자: '있음' }];
    const result = mergeHeader(existingRows, ['명칭', '주소', '네이버플레이스ID']);
    expect(result).toEqual(['명칭', '주소', '네이버플레이스ID', '아기의자']);
  });
});

describe('writeCsvUtf8 + readCsvUtf8 라운드트립', () => {
  it('mergeHeader로 만든 헤더로 쓰면 이후 단계가 추가한 컬럼이 보존된다', () => {
    const tmpFile = path.join(os.tmpdir(), `csv-roundtrip-${Date.now()}.csv`);
    try {
      const rows = [{ 명칭: '식당A', 주소: '주소A', 아기의자: '있음' }];
      const header = mergeHeader(rows, ['명칭', '주소']);
      writeCsvUtf8(tmpFile, header, rows);

      const reread = readCsvUtf8(tmpFile);
      expect(reread[0]).toEqual({ 명칭: '식당A', 주소: '주소A', 아기의자: '있음' });
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
