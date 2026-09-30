import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

// [표준중분류 '전시실'/'미술관' 명칭·주소 CSV 내보내기] 검증: 두 카테고리를
// 각각 별도 CSV로 저장하고, 페이지네이션(1,000건 상한) 처리 및 display_name
// 우선순위가 올바른지 확인한다.

function makeAdminClient(rowsByFilter) {
  const fromMock = vi.fn(() => ({
    select: () => ({
      eq: (_col, categoryMin) => ({
        or: () => ({
          range: (from) => {
            const rows = rowsByFilter[`eq:${categoryMin}`] ?? [];
            const page = rows.slice(from, from + 1000);
            return Promise.resolve({ data: page, error: null });
          },
        }),
      }),
    }),
  }));
  return { from: fromMock };
}

describe('export-exhibition-and-art-museum-name-address run()', () => {
  const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./ingest/lib/supabase-admin.mjs');
  });

  it('전시실.csv와 미술관.csv를 각각 별도 파일로 저장한다', async () => {
    const admin = makeAdminClient({
      'eq:전시실': [{ id: '1', name: '테스트전시실', display_name: null, address: '주소1' }],
      'eq:미술관': [{ id: '2', name: '테스트미술관', display_name: null, address: '주소2' }],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-exhibition-and-art-museum-name-address.mjs');
    const result = await run();

    expect(writeFileSyncSpy.mock.calls.map((c) => c[0])).toEqual(['전시실.csv', '미술관.csv']);
    expect(result).toEqual({ exhibitionCount: 1, artMuseumCount: 1 });
  });

  it('display_name이 있으면 원본 name 대신 display_name을 쓴다', async () => {
    const admin = makeAdminClient({
      'eq:전시실': [{ id: '1', name: '원본이름', display_name: '노출이름', address: '주소1' }],
      'eq:미술관': [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-exhibition-and-art-museum-name-address.mjs');
    await run();

    const call = writeFileSyncSpy.mock.calls.find((c) => c[0] === '전시실.csv');
    expect(call[1]).toContain('노출이름');
    expect(call[1]).not.toContain('원본이름');
  });

  it('1,000건이 넘으면 여러 페이지로 나눠 전량 조회한다', async () => {
    const manyRows = Array.from({ length: 1500 }, (_, i) => ({ id: `id-${i}`, name: `이름${i}`, display_name: null, address: `주소${i}` }));
    const admin = makeAdminClient({ 'eq:전시실': manyRows, 'eq:미술관': [] });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-exhibition-and-art-museum-name-address.mjs');
    const result = await run();

    expect(result.exhibitionCount).toBe(1500);
  });
});
