import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// [표준중분류별 공지 크롤링 제외](2026-09-28 사용자 지시, todo.md 개선사항2): "표준
// 중분류가 '어린이도서관'인 항목은 크롤링 대상에서 제외.. 불필요한 네트워크 요청이나
// 업데이트 로직을 타지 않도록" — 제외 대상 스팟은 fetch/notice_checked_at 갱신
// 어느 쪽도 타지 않는지 검증한다.

function makeAdminClient({ spots }) {
  const updateCalls = [];
  const upsertCalls = [];
  const fromMock = vi.fn((table) => {
    if (table === 'open_spaces') {
      return {
        select: () => ({
          not: () => ({
            or: () => Promise.resolve({ data: spots, error: null }),
          }),
        }),
        update: (patch) => ({
          eq: (_col, id) => {
            updateCalls.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'spot_notices') {
      return {
        upsert: (rows) => {
          upsertCalls.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { fromMock, updateCalls, upsertCalls };
}

describe('notice-refresh-batch run()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.doUnmock('./lib/supabase-admin.mjs');
    vi.resetModules();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('표준중분류가 "어린이도서관"인 스팟은 크롤링/갱신을 건너뛴다', async () => {
    const spots = [
      { id: 'lib-1', naver_place_id: 'naver-1', category_min: '어린이도서관' },
      { id: 'restaurant-1', naver_place_id: 'naver-2', category_min: '놀이방식당' },
    ];
    const { fromMock, updateCalls } = makeAdminClient({ spots });
    vi.doMock('./lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') }));
    vi.stubGlobal('fetch', fetchMock);

    const { run } = await import('./notice-refresh-batch.mjs');
    const runPromise = run();
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('naver-2');
    expect(updateCalls).toEqual([{ id: 'restaurant-1', patch: expect.objectContaining({ notice_checked_at: expect.any(String) }) }]);
    expect(result).toEqual({ targetCount: 1, excludedCount: 1, checkedCount: 1, savedNoticeCount: 0, failedCount: 0 });
  });

  it('제외 대상 중분류가 없으면 기존처럼 전부 처리한다', async () => {
    const spots = [
      { id: 'restaurant-1', naver_place_id: 'naver-1', category_min: '놀이방식당' },
      { id: 'spa-1', naver_place_id: 'naver-2', category_min: '놀이방찜질방/스파' },
    ];
    const { fromMock } = makeAdminClient({ spots });
    vi.doMock('./lib/supabase-admin.mjs', () => ({ createAdminClient: () => ({ from: fromMock }) }));

    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') }));
    vi.stubGlobal('fetch', fetchMock);

    const { run } = await import('./notice-refresh-batch.mjs');
    const runPromise = run();
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.excludedCount).toBe(0);
    expect(result.checkedCount).toBe(2);
  });
});
