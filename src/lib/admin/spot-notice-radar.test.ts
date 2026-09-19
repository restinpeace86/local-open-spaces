import { afterEach, describe, expect, it, vi } from 'vitest';

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): checkAndFetchSpotNotices의
// (1) "오늘 이미 체크했으면 스킵" TTL, (2) naver_place_id 없으면 스킵, (3) 실제 크롤링→
// spot_notices upsert(중복 무시)→notice_checked_at 갱신, (4) 조회 실패 시 TTL을
// 소모하지 않음(다음 방문 때 재시도), (5) 예외를 절대 던지지 않음(무중단 원칙)을 검증한다.

function makeSupabaseMock({
  naverPlaceId,
  noticeCheckedAt,
  spotError = null,
}: {
  naverPlaceId: string | null;
  noticeCheckedAt: string | null;
  spotError?: { message: string } | null;
}) {
  const upsertCalls: unknown[][] = [];
  const updateCalls: unknown[] = [];

  const openSpacesBuilder = {
    select: () => openSpacesBuilder,
    eq: () => openSpacesBuilder,
    single: () =>
      Promise.resolve({
        data: spotError ? null : { naver_place_id: naverPlaceId, notice_checked_at: noticeCheckedAt },
        error: spotError,
      }),
    update: (payload: unknown) => {
      updateCalls.push(payload);
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    },
  };

  const spotNoticesBuilder = {
    upsert: (rows: unknown[], options: unknown) => {
      upsertCalls.push([rows, options]);
      return Promise.resolve({ error: null });
    },
  };

  const client = {
    from: (table: string) => (table === 'open_spaces' ? openSpacesBuilder : spotNoticesBuilder),
  };

  return { client, upsertCalls, updateCalls };
}

describe('checkAndFetchSpotNotices', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('naver_place_id가 없으면 아무것도 하지 않는다', async () => {
    const { client, upsertCalls, updateCalls } = makeSupabaseMock({ naverPlaceId: null, noticeCheckedAt: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await checkAndFetchSpotNotices('spot-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('오늘(KST) 이미 체크했으면 다시 크롤링하지 않는다', async () => {
    const todayIso = new Date().toISOString();
    const { client, upsertCalls } = makeSupabaseMock({ naverPlaceId: '1107293125', noticeCheckedAt: todayIso });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await checkAndFetchSpotNotices('spot-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertCalls).toHaveLength(0);
  });

  it('어제 체크했으면(오늘 아님) 다시 크롤링하고 spot_notices에 upsert한다', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { client, upsertCalls, updateCalls } = makeSupabaseMock({
      naverPlaceId: '1107293125',
      noticeCheckedAt: yesterday,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

    const feedHtml = `<script>window.__APOLLO_STATE__ = ${JSON.stringify({
      'Feed:1107293125_1': {
        __typename: 'Feed',
        id: '1107293125_1',
        title: '추석연휴~정상영업 합니다~^^',
        desc: '추석연휴 정상영업 합니다~^^',
        category: '알림',
        isDeleted: false,
        isPinned: true,
        createdString: '20260907',
        media: [{ __typename: 'FeedMedia', thumbnail: 'https://example.com/a.jpg' }],
      },
    })};</script>`;
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(feedHtml) }));
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await checkAndFetchSpotNotices('spot-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://pcmap.place.naver.com/restaurant/1107293125/feed',
      expect.objectContaining({ headers: expect.any(Object), signal: expect.any(AbortSignal) })
    );
    expect(upsertCalls).toHaveLength(1);
    const [rows, options] = upsertCalls[0] as [Array<Record<string, unknown>>, Record<string, unknown>];
    expect(rows).toEqual([
      {
        spot_id: 'spot-1',
        raw_naver_feed_id: '1107293125_1',
        raw_title: '추석연휴~정상영업 합니다~^^',
        raw_content: '추석연휴 정상영업 합니다~^^',
        raw_image_url: 'https://example.com/a.jpg',
        raw_category: '알림',
        raw_posted_at: '20260907',
      },
    ]);
    expect(options).toEqual({ onConflict: 'spot_id,raw_naver_feed_id', ignoreDuplicates: true });
    expect(updateCalls).toHaveLength(1); // notice_checked_at 갱신됨.
  });

  it('네이버 조회가 실패하면(ok=false) notice_checked_at을 갱신하지 않는다(다음 방문 때 재시도)', async () => {
    const { client, upsertCalls, updateCalls } = makeSupabaseMock({ naverPlaceId: '1107293125', noticeCheckedAt: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') }));
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await checkAndFetchSpotNotices('spot-1');

    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('fetch 자체가 예외를 던져도(네트워크 오류 등) 함수는 예외를 던지지 않는다(무중단 원칙)', async () => {
    const { client } = makeSupabaseMock({ naverPlaceId: '1107293125', noticeCheckedAt: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    );

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await expect(checkAndFetchSpotNotices('spot-1')).resolves.toBeUndefined();
  });

  it('스팟 조회 자체가 실패해도 예외를 던지지 않는다', async () => {
    const { client } = makeSupabaseMock({
      naverPlaceId: null,
      noticeCheckedAt: null,
      spotError: { message: 'db down' },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    vi.stubGlobal('fetch', vi.fn());

    const { checkAndFetchSpotNotices } = await import('./spot-notice-radar');
    await expect(checkAndFetchSpotNotices('spot-1')).resolves.toBeUndefined();
  });
});
