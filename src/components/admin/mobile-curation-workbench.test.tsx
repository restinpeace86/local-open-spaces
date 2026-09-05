import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileCurationWorkbench } from './mobile-curation-workbench';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시) 단위 테스트.
const SPOT = { id: 'spot-1', name: '행복키즈카페', address: '경기도 성남시 1', service_category_id: null };
const SERVICE_CATEGORIES = [{ id: 'svc-1', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' }];
const QUEUE = [
  { id: 'spot-1', name: '행복키즈카페', address: '경기도 성남시 1', category_min: '키즈카페' },
  { id: 'spot-2', name: '동네키즈카페', address: '경기도 성남시 2', category_min: '키즈카페' },
  { id: 'spot-3', name: '숲속키즈카페', address: '경기도 성남시 3', category_min: '키즈카페' },
];

type MockHandlers = {
  nearby?: unknown;
  blogSearch?: unknown;
  existingCurationBySpotId?: Record<string, unknown>;
  curationSaveOk?: boolean;
};

function mockFetchByUrl(handlers: MockHandlers) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-dedup/nearby')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.nearby ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/pending-groups')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ group_key: 'k' }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations/blog-search')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(handlers.blogSearch ?? { items: [], hasRecentReview: false, hasNoResults: true }),
      } as Response);
    }
    if (url.includes('/api/admin/spot-curations') && (!init || init.method === undefined)) {
      const spotIdMatch = /spot_id=([^&]+)/.exec(url);
      const spotId = spotIdMatch ? decodeURIComponent(spotIdMatch[1]) : '';
      const item = handlers.existingCurationBySpotId?.[spotId] ?? null;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations')) {
      const ok = handlers.curationSaveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { item: { id: 'curation-1' } } : { error: '저장 실패' }),
      } as Response);
    }
    if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ updated_count: 1 }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('MobileCurationWorkbench', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // [1단: 중복 장소 검수 배너](사용자 지시 원문): "반경 내 유사 장소 안내
  // ([⚠️ 유사 장소 발견: 합치기 / 유지])"
  it('반경 내 유사 장소가 있으면 경고 배너와 합치기/유지 버튼을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        nearby: { items: [{ id: 'near-1', name: '행복키즈카페 분점', category: 'CULTURE', category_min: '키즈카페', address: '바로 옆', distance_m: 12 }] },
      })
    );
    render(
      <MobileCurationWorkbench spot={SPOT} serviceCategories={SERVICE_CATEGORIES} queue={QUEUE} onClose={vi.fn()} onAdvance={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    expect(await screen.findByText(/유사 장소 발견: 행복키즈카페 분점/)).toBeInTheDocument();
    expect(screen.getByText('합치기')).toBeInTheDocument();
    expect(screen.getByText('유지(다른 장소임)')).toBeInTheDocument();
  });

  it('유사 장소가 없으면 배너를 보여주지 않는다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ nearby: { items: [] } }));
    render(
      <MobileCurationWorkbench spot={SPOT} serviceCategories={SERVICE_CATEGORIES} queue={QUEUE} onClose={vi.fn()} onAdvance={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('2. 노출 중분류 & 편의시설 뱃지');
    expect(screen.queryByText('합치기')).not.toBeInTheDocument();
  });

  it('"유지"를 누르면 배너가 사라지고 ignored 상태로 임시 저장한다', async () => {
    const fetchMock = mockFetchByUrl({
      nearby: { items: [{ id: 'near-1', name: '행복키즈카페 분점', category: 'CULTURE', category_min: '키즈카페', address: '바로 옆', distance_m: 12 }] },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MobileCurationWorkbench spot={SPOT} serviceCategories={SERVICE_CATEGORIES} queue={QUEUE} onClose={vi.fn()} onAdvance={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText(/유사 장소 발견/);
    fireEvent.click(screen.getByText('유지(다른 장소임)'));

    await waitFor(() => expect(screen.queryByText(/유사 장소 발견/)).not.toBeInTheDocument());
    const pendingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/pending-groups'));
    expect(pendingCall).toBeDefined();
    expect(JSON.parse((pendingCall![1] as RequestInit).body as string)).toEqual({
      member_spot_ids: ['spot-1', 'near-1'],
      status: 'ignored',
    });
  });

  // [3단: 블로그 참고](재사용 확인) — BlogCurationModal과 동일한 뷰어가 그대로 뜬다.
  it('블로그 검색 결과와 하이라이팅이 표시된다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        blogSearch: {
          items: [
            { title: '행복키즈카페 후기', link: 'https://blog.naver.com/1', description: '주차장이 넓어요', bloggername: '맘', postdate: '20260101', isRecent: true },
          ],
          hasRecentReview: true,
          hasNoResults: false,
        },
      })
    );
    render(
      <MobileCurationWorkbench spot={SPOT} serviceCategories={SERVICE_CATEGORIES} queue={QUEUE} onClose={vi.fn()} onAdvance={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    expect(await screen.findByText('행복키즈카페 후기')).toBeInTheDocument();
    expect(screen.getByText('주차장')).toBeInTheDocument(); // <mark>로 감싸진 키워드
  });

  // [4단: 저장 및 다음 이동](사용자 지시 원문): "저장 시.. 업데이트하고.. 저장 완료 후
  // 자동으로 다음 미처리 스팟으로 뷰가 전환됨."
  it('저장 후 큐에서 아직 큐레이션이 없는 다음 스팟으로 이동한다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        existingCurationBySpotId: {
          'spot-2': { id: 'c-2', spot_id: 'spot-2', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['parking'] },
          // spot-3는 큐레이션 레코드가 없음(미처리) → 저장 후 이 스팟으로 이동해야 한다.
        },
      })
    );
    const onAdvance = vi.fn();
    const onServiceCategoryUpdated = vi.fn();
    render(
      <MobileCurationWorkbench
        spot={SPOT}
        serviceCategories={SERVICE_CATEGORIES}
        queue={QUEUE}
        onClose={vi.fn()}
        onAdvance={onAdvance}
        onServiceCategoryUpdated={onServiceCategoryUpdated}
      />
    );

    await screen.findByText('2. 노출 중분류 & 편의시설 뱃지');
    fireEvent.click(screen.getByText('저장 및 다음 미처리 스팟으로 이동'));

    await waitFor(() => expect(onAdvance).toHaveBeenCalledWith('spot-3'));
    expect(onServiceCategoryUpdated).toHaveBeenCalledWith('spot-1', null);
  });

  it('큐의 나머지 스팟이 모두 처리됐으면 완료 메시지를 보여주고 종료를 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        existingCurationBySpotId: {
          'spot-2': { id: 'c-2', spot_id: 'spot-2', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['parking'] },
          'spot-3': { id: 'c-3', spot_id: 'spot-3', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['stroller'] },
        },
      })
    );
    const onAdvance = vi.fn();
    render(
      <MobileCurationWorkbench
        spot={SPOT}
        serviceCategories={SERVICE_CATEGORIES}
        queue={QUEUE}
        onClose={vi.fn()}
        onAdvance={onAdvance}
        onServiceCategoryUpdated={vi.fn()}
      />
    );

    await screen.findByText('2. 노출 중분류 & 편의시설 뱃지');
    fireEvent.click(screen.getByText('저장 및 다음 미처리 스팟으로 이동'));

    expect(await screen.findByText('✅ 이 목록의 모든 스팟을 처리했습니다.')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onAdvance).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  // ["합치기"](사용자 지시 원문) — 기존 SpotDedupPanel의 그룹 병합 모달을 재사용한다.
  it('"합치기"를 누르면 기존 중복 그룹 병합 모달이 뜬다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        nearby: { items: [{ id: 'near-1', name: '행복키즈카페 분점', category: 'CULTURE', category_min: '키즈카페', address: '바로 옆', distance_m: 12 }] },
      })
    );
    render(
      <MobileCurationWorkbench spot={SPOT} serviceCategories={SERVICE_CATEGORIES} queue={QUEUE} onClose={vi.fn()} onAdvance={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText(/유사 장소 발견/);
    fireEvent.click(screen.getByText('합치기'));

    expect(await screen.findByText('중복 의심 그룹 검수 (2건)')).toBeInTheDocument();
  });
});
