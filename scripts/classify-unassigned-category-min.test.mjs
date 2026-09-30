import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// [표준중분류 미지정 데이터 LLM 분류 러너] 검증 — classifyBatch를 모킹해
// 네트워크 호출 없이 CSV 입출력/배치 분할/오류 시 미지정 유지 로직만 검증한다.

describe('classify-unassigned-category-min run()', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-unassigned-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.doUnmock('./lib/unassigned-category-classification.mjs');
    vi.resetModules();
  });

  it('A/B열 내용을 바꾸지 않고 C열에 분류 결과를 채운 CSV를 만든다', async () => {
    vi.doMock('./lib/unassigned-category-classification.mjs', () => ({
      classifyBatch: async (batch) => batch.map((r) => (r.name === '중랑캠핑숲' ? '캠핑장' : null)),
      sleep: async () => {},
      REQUEST_INTERVAL_MS: 0,
      BATCH_SIZE: 20,
    }));

    const inputPath = path.join(tmpDir, 'input.csv');
    const outputPath = path.join(tmpDir, 'output.csv');
    fs.writeFileSync(
      inputPath,
      '명칭,주소\n중랑캠핑숲,서울 중랑구 송림길 160\n알수없는시설,알수없는주소\n',
      'utf-8'
    );

    process.env.GEMINI_API_KEY = 'test-key';
    const { run } = await import('./classify-unassigned-category-min.mjs');
    const result = await run({ inputPath, outputPath });

    expect(result).toEqual({ total: 2, matched: 1, unassigned: 1, error: 0 });
    const output = fs.readFileSync(outputPath, 'utf-8');
    expect(output).toContain('명칭,주소,표준중분류(LLM 분류)');
    expect(output).toContain('중랑캠핑숲,서울 중랑구 송림길 160,캠핑장');
    expect(output).toContain('알수없는시설,알수없는주소,');
  });

  it('콤마가 포함된 주소(따옴표로 감싼 필드)를 원본 그대로 보존한다', async () => {
    vi.doMock('./lib/unassigned-category-classification.mjs', () => ({
      classifyBatch: async (batch) => batch.map(() => null),
      sleep: async () => {},
      REQUEST_INTERVAL_MS: 0,
      BATCH_SIZE: 20,
    }));

    const inputPath = path.join(tmpDir, 'input.csv');
    const outputPath = path.join(tmpDir, 'output.csv');
    fs.writeFileSync(inputPath, '명칭,주소\n아이띠네 신림,"서울특별시 관악구 난우길 51, 2층 (신림동)"\n', 'utf-8');

    process.env.GEMINI_API_KEY = 'test-key';
    const { run } = await import('./classify-unassigned-category-min.mjs');
    await run({ inputPath, outputPath });

    const output = fs.readFileSync(outputPath, 'utf-8');
    expect(output).toContain('아이띠네 신림,"서울특별시 관악구 난우길 51, 2층 (신림동)",');
  });

  it('배치 호출이 실패해도 해당 배치는 미지정으로 유지하고 나머지 배치는 계속 처리한다', async () => {
    let callCount = 0;
    vi.doMock('./lib/unassigned-category-classification.mjs', () => ({
      classifyBatch: async (batch) => {
        callCount += 1;
        if (callCount === 1) throw new Error('일시적 오류');
        return batch.map(() => '공원');
      },
      sleep: async () => {},
      REQUEST_INTERVAL_MS: 0,
      BATCH_SIZE: 1,
    }));

    const inputPath = path.join(tmpDir, 'input.csv');
    const outputPath = path.join(tmpDir, 'output.csv');
    fs.writeFileSync(inputPath, '명칭,주소\n실패건,주소1\n성공건,주소2\n', 'utf-8');

    process.env.GEMINI_API_KEY = 'test-key';
    const { run } = await import('./classify-unassigned-category-min.mjs');
    const result = await run({ inputPath, outputPath });

    expect(result).toEqual({ total: 2, matched: 1, unassigned: 0, error: 1 });
    const output = fs.readFileSync(outputPath, 'utf-8');
    expect(output).toContain('실패건,주소1,');
    expect(output).toContain('성공건,주소2,공원');
  });

});
