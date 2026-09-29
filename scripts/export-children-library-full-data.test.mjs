import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

// [노출중분류 '어린이도서관' 전체 데이터 CSV 내보내기] 검증: 대표 행만
// 추출, 뱃지 키→한글 라벨 변환, 정기휴무 요일/N번째 요일 변환, 큐레이션
// 없는 스팟도 빈 값으로 처리되는지 확인한다.

function makeAdminClient({ openSpacesRows, curationRows = [] }) {
  const fromMock = vi.fn((table) => {
    if (table === 'open_spaces') {
      return {
        select: () => ({
          eq: () => ({
            or: () => ({
              range: () => Promise.resolve({ data: openSpacesRows, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'spot_curations') {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: curationRows, error: null }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from: fromMock };
}

describe('export-children-library-full-data run()', () => {
  const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

  beforeEach(() => {
    writeFileSyncSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./ingest/lib/supabase-admin.mjs');
  });

  it('명칭/주소/뱃지(한글 라벨)/정기휴무요일/N번째요일 컬럼을 채운다', async () => {
    const admin = makeAdminClient({
      openSpacesRows: [
        {
          id: 'lib-1',
          name: '원본이름',
          display_name: null,
          standard_name: '표준이름도서관',
          address: '서울시 종로구 1',
          excluded_weekdays: ['MON', 'TUE'],
          excluded_nth_weekdays: ['2-SAT'],
        },
      ],
      curationRows: [{ spot_id: 'lib-1', curation_badges: ['floor_seating', 'lib_weekend_program'] }],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-children-library-full-data.mjs');
    const result = await run();

    expect(result).toEqual({ filename: '어린이도서관_전체데이터.csv', count: 1 });
    const csvContent = writeFileSyncSpy.mock.calls[0][1];
    expect(csvContent).toContain('표준이름도서관,서울시 종로구 1,"신발벗는 온돌·마루방, 주말 독서·체험 프로그램","월, 화",매월 2번째 토요일');
  });

  it('standard_name이 없으면 display_name, 그것도 없으면 원본 name을 쓴다', async () => {
    const admin = makeAdminClient({
      openSpacesRows: [
        { id: 'lib-1', name: '원본A', display_name: '노출A', standard_name: null, address: '주소A', excluded_weekdays: null, excluded_nth_weekdays: null },
        { id: 'lib-2', name: '원본B', display_name: null, standard_name: null, address: '주소B', excluded_weekdays: null, excluded_nth_weekdays: null },
      ],
      curationRows: [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-children-library-full-data.mjs');
    await run();

    const csvContent = writeFileSyncSpy.mock.calls[0][1];
    expect(csvContent).toContain('노출A,주소A');
    expect(csvContent).toContain('원본B,주소B');
  });

  it('큐레이션/정기휴무 값이 없는 스팟은 해당 컬럼이 빈 값으로 남는다', async () => {
    const admin = makeAdminClient({
      openSpacesRows: [
        { id: 'lib-1', name: '이름만있는곳', display_name: null, standard_name: null, address: '주소', excluded_weekdays: null, excluded_nth_weekdays: null },
      ],
      curationRows: [],
    });
    vi.doMock('./ingest/lib/supabase-admin.mjs', () => ({ createAdminClient: () => admin }));

    const { run } = await import('./export-children-library-full-data.mjs');
    await run();

    const csvContent = writeFileSyncSpy.mock.calls[0][1];
    expect(csvContent).toContain('이름만있는곳,주소,,,');
  });
});
