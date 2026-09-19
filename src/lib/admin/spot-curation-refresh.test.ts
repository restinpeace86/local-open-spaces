import { afterEach, describe, expect, it, vi } from 'vitest';

// [스팟 큐레이션 온디맨드 재크롤링](2026-09-20 사용자 지시): checkAndRefreshSpotCuration의
// (1) naver_place_id 없으면 스킵, (2) 아직 큐레이션이 없으면(새로 만들지 않음) 스킵,
// (3) 최소 7일 미경과 시 스킵, (4) 7일 이상 경과했으면 재크롤링해 spot_curations를
// 갱신, (5) 기존에 is_kids_menu가 true였던 항목은 재크롤링 결과가 매칭 안 해도
// 되돌리지 않음, (6) 크롤링 실패 시 last_crawled_at을 건드리지 않음(다음 방문 때
// 재시도), (7) 예외를 절대 던지지 않음을 검증한다.

const PLACE_ID = '36200306';

function toHtml(state: Record<string, unknown>): string {
  return `<script>window.__APOLLO_STATE__ = ${JSON.stringify(state)};</script>`;
}

const homeState = {
  ROOT_QUERY: {
    __typename: 'Query',
    [`placeDetail({"input":{"deviceType":"pcmap","id":"${PLACE_ID}","isNx":false}})`]: {
      __typename: 'PlaceDetail',
      base: { __ref: `PlaceDetailBase:${PLACE_ID}` },
      newBusinessHours: [
        {
          __typename: 'NewBusinessHour',
          businessHours: [
            {
              __typename: 'WorkingHoursInfo',
              day: '월',
              businessHours: { __typename: 'StartEndTime', start: '11:00', end: '21:00' },
              breakHours: [],
              description: null,
            },
          ],
        },
      ],
      topPhotos: { __typename: 'PlaceDetailTopPhotos', total: 0, items: [] },
    },
  },
  [`PlaceDetailBase:${PLACE_ID}`]: {
    __typename: 'PlaceDetailBase',
    id: PLACE_ID,
    name: '테스트 식당',
    roadAddress: null,
    address: null,
    phone: null,
    category: '한식',
    conveniences: [],
  },
  'PlaceMenuItem:1': {
    __typename: 'PlaceMenuItem',
    name: '애기밥',
    price: { __typename: 'PlaceMenuPrice', displayText: '3,000원' },
    thumbnailUrl: null,
  },
  'PlaceMenuItem:2': {
    __typename: 'PlaceMenuItem',
    name: '삼겹살',
    price: { __typename: 'PlaceMenuPrice', displayText: '15,000원' },
    thumbnailUrl: null,
  },
};

function makeSupabaseMock({
  naverPlaceId,
  spotError = null,
  curation,
  curationError = null,
}: {
  naverPlaceId: string | null;
  spotError?: { message: string } | null;
  curation: { id: string; last_crawled_at: string | null; menu_items: unknown; curation_badges: unknown } | null;
  curationError?: { message: string } | null;
}) {
  const updateCalls: Array<{ payload: unknown; id: string }> = [];

  const openSpacesBuilder = {
    select: () => openSpacesBuilder,
    eq: () => openSpacesBuilder,
    single: () =>
      Promise.resolve({
        data: spotError ? null : { naver_place_id: naverPlaceId },
        error: spotError,
      }),
  };

  const spotCurationsBuilder = {
    select: () => spotCurationsBuilder,
    eq: () => spotCurationsBuilder,
    maybeSingle: () => Promise.resolve({ data: curationError ? null : curation, error: curationError }),
    update: (payload: unknown) => ({
      eq: (_col: string, id: string) => {
        updateCalls.push({ payload, id });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };

  const client = {
    from: (table: string) => (table === 'open_spaces' ? openSpacesBuilder : spotCurationsBuilder),
  };

  return { client, updateCalls };
}

describe('checkAndRefreshSpotCuration', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('naver_place_id가 없으면 아무것도 하지 않는다', async () => {
    const { client, updateCalls } = makeSupabaseMock({ naverPlaceId: null, curation: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('아직 큐레이션이 없는 스팟이면 새로 만들지 않는다', async () => {
    const { client, updateCalls } = makeSupabaseMock({ naverPlaceId: PLACE_ID, curation: null });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('마지막 크롤링 후 7일이 안 지났으면 다시 크롤링하지 않는다', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { client, updateCalls } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: { id: 'curation-1', last_crawled_at: sixDaysAgo, menu_items: [], curation_badges: [] },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('사용자 확인대로 "최소 7일 경과"는 달력일이 아니라 정확한 경과 시간 기준이다(10일 후에 눌렀으면 10일 만에 반영)', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { client, updateCalls } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: { id: 'curation-1', last_crawled_at: tenDaysAgo, menu_items: [], curation_badges: [] },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(url.includes('/home') ? toHtml(homeState) : toHtml({})) })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(fetchMock).toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
  });

  it('7일 이상 경과했으면 재크롤링해 영업시간/메뉴를 spot_curations에 반영한다', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { client, updateCalls } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: { id: 'curation-1', last_crawled_at: eightDaysAgo, menu_items: [], curation_badges: [] },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(url.includes('/home') ? toHtml(homeState) : toHtml({})) })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(updateCalls).toHaveLength(1);
    const { payload, id } = updateCalls[0] as {
      payload: {
        operating_hours_raw: string | null;
        open_time: string | null;
        close_time: string | null;
        menu_items: Array<{ name: string; price: number; is_kids_menu?: boolean }>;
        last_crawled_at: string;
      };
      id: string;
    };
    expect(id).toBe('curation-1');
    expect(payload.open_time).toBe('11:00');
    expect(payload.close_time).toBe('21:00');
    expect(payload.menu_items).toEqual([
      { name: '애기밥', price: 3000, is_kids_menu: false },
      { name: '삼겹살', price: 15000, is_kids_menu: false },
    ]);
    expect(payload.last_crawled_at).toBeTruthy();
  });

  it('기존에 is_kids_menu가 true였던 항목은 재크롤링 결과가 매칭 안 해도 되돌리지 않는다(관리자 수동 지정 보존)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { client, updateCalls } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: {
        id: 'curation-1',
        last_crawled_at: eightDaysAgo,
        // "애기밥"은 자동 매칭 대상이 아니지만 지난번에 관리자가 수동으로 켜 뒀다.
        menu_items: [{ name: '애기밥', price: 3000, is_kids_menu: true }],
        curation_badges: [],
      },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(url.includes('/home') ? toHtml(homeState) : toHtml({})) })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    const { payload } = updateCalls[0] as {
      payload: { menu_items: Array<{ name: string; is_kids_menu?: boolean }>; curation_badges: string[] };
    };
    expect(payload.menu_items.find((m) => m.name === '애기밥')?.is_kids_menu).toBe(true);
    // 유지된 키즈메뉴 항목이 있으므로 전체 뱃지도 OFF→ON으로 함께 반영된다.
    expect(payload.curation_badges).toContain('kids_menu');
  });

  it('크롤링에 실패하면(둘 다 조회 실패) spot_curations를 갱신하지 않는다(다음 방문 때 재시도)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { client, updateCalls } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: { id: 'curation-1', last_crawled_at: eightDaysAgo, menu_items: [], curation_badges: [] },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') })));

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await checkAndRefreshSpotCuration('spot-1');

    expect(updateCalls).toHaveLength(0);
  });

  it('fetch가 예외를 던져도(네트워크 오류) 함수는 예외를 던지지 않는다(무중단 원칙)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = makeSupabaseMock({
      naverPlaceId: PLACE_ID,
      curation: { id: 'curation-1', last_crawled_at: eightDaysAgo, menu_items: [], curation_badges: [] },
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down')))
    );

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await expect(checkAndRefreshSpotCuration('spot-1')).resolves.toBeUndefined();
  });

  it('스팟/큐레이션 조회 자체가 실패해도 예외를 던지지 않는다', async () => {
    const { client } = makeSupabaseMock({
      naverPlaceId: null,
      spotError: { message: 'db down' },
      curation: null,
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
    vi.stubGlobal('fetch', vi.fn());

    const { checkAndRefreshSpotCuration } = await import('./spot-curation-refresh');
    await expect(checkAndRefreshSpotCuration('spot-1')).resolves.toBeUndefined();
  });
});
