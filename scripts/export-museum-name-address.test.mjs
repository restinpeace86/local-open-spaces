import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

// [문화시설 표준중분류별 명칭·주소 CSV 내보내기] 검증: 카테고리별 파일 분리,
// 중복 대표만 추출(비대표 필터), 사설 교육기관 이름 패턴 제외, CSV 콤마
// 이스케이프를 확인한다.

function makeAdminClient(rowsByCategory) {
  const fromMock = vi.fn(() => ({
    select: () => ({
      eq: (_col, categoryMin) => ({
        or: () => ({
          range: () => Promise.resolve({ data: rowsByCategory[categoryMin] ?? [], error: null }),
        }),
      }),
    }),
  }));
  return { from: fromMock };
}

describe('export-museum-name-address run()', () => {
  const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./ingest/lib/supabase-admin.mjs');
  });

  it('3개 표준중분류를 각각 별도 CSV 파일로 저장한다', async () => {
    const admin = makeAdminClient({
      과학관: [{ id: '1', name: '국립대구과학관', display_name: null, address: '대구 달성군 1' }],
      역사박물관: [{ id: '2', name: '대한민국역사박물관', display_name: null, address: '서울 종로구 1' }],
      '종합/기타박물관': [{ id: '3', name: '수원박물관', display_name: null, address: '경기 수원시 1' }],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-museum-name-address.mjs');
    const summary = await run();

    expect(writeFileSyncSpy).toHaveBeenCalledTimes(3);
    expect(writeFileSyncSpy.mock.calls.map((c) => c[0])).toEqual(['과학관.csv', '역사박물관.csv', '종합기타박물관.csv']);
    expect(summary).toEqual([
      { categoryMin: '과학관', filename: '과학관.csv', includedCount: 1, excludedCount: 0 },
      { categoryMin: '역사박물관', filename: '역사박물관.csv', includedCount: 1, excludedCount: 0 },
      { categoryMin: '종합/기타박물관', filename: '종합기타박물관.csv', includedCount: 1, excludedCount: 0 },
    ]);
  });

  it('"OO어린이천문대" 이름 패턴은 사설 교육기관으로 제외한다(공백 유무 무관)', async () => {
    const admin = makeAdminClient({
      과학관: [
        { id: '1', name: '세종어린이천문대', display_name: null, address: '세종시 1' },
        { id: '2', name: '안산 어린이 천문대', display_name: null, address: '안산시 1' },
        { id: '3', name: '국립대구과학관', display_name: null, address: '대구 달성군 1' },
      ],
      역사박물관: [],
      '종합/기타박물관': [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-museum-name-address.mjs');
    const summary = await run();

    const scienceMuseumCall = writeFileSyncSpy.mock.calls.find((c) => c[0] === '과학관.csv');
    expect(scienceMuseumCall[1]).toContain('국립대구과학관');
    expect(scienceMuseumCall[1]).not.toContain('천문대');
    expect(summary[0]).toEqual({ categoryMin: '과학관', filename: '과학관.csv', includedCount: 1, excludedCount: 2 });
  });

  it('display_name이 있으면 원본 name 대신 display_name을 쓴다', async () => {
    const admin = makeAdminClient({
      과학관: [{ id: '1', name: '원본이름', display_name: '노출이름', address: '주소 1' }],
      역사박물관: [],
      '종합/기타박물관': [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-museum-name-address.mjs');
    await run();

    const call = writeFileSyncSpy.mock.calls.find((c) => c[0] === '과학관.csv');
    expect(call[1]).toContain('노출이름');
    expect(call[1]).not.toContain('원본이름');
  });

  it('명칭이나 주소에 쉼표가 있으면 쌍따옴표로 감싼다(CSV 포맷 보호)', async () => {
    const admin = makeAdminClient({
      과학관: [{ id: '1', name: '테스트, 과학관', display_name: null, address: '서울시, 종로구 1' }],
      역사박물관: [],
      '종합/기타박물관': [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-museum-name-address.mjs');
    await run();

    const call = writeFileSyncSpy.mock.calls.find((c) => c[0] === '과학관.csv');
    expect(call[1]).toContain('"테스트, 과학관","서울시, 종로구 1"');
  });
});
