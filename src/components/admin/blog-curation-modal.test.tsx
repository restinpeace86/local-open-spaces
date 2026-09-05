import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlogCurationModal } from './blog-curation-modal';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) 단위 테스트.
const SPOT = { id: 'spot-1', name: '행복키즈카페', address: '경기도 성남시 분당구 1', service_category_id: null };
const SERVICE_CATEGORIES = [{ id: 'svc-1', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' }];

function makeBlogItem(overrides: Partial<{ title: string; link: string; description: string; bloggername: string; postdate: string; isRecent: boolean }> = {}) {
  return {
    title: '행복키즈카페 다녀왔어요',
    link: 'https://blog.naver.com/abc/1',
    description: '주차장이 넓고 유모차도 편하게 다닐 수 있어요',
    bloggername: '맘블로거',
    postdate: '20260101',
    isRecent: true,
    ...overrides,
  };
}

function mockFetchByUrl(handlers: {
  blogSearch?: { items?: unknown[]; hasRecentReview?: boolean; hasNoResults?: boolean } | { error: string };
  existingCuration?: unknown;
  categoryMappingOk?: boolean;
  curationSaveOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-curations/blog-search')) {
      const body = handlers.blogSearch ?? { items: [], hasRecentReview: false, hasNoResults: true };
      return Promise.resolve({ ok: !('error' in body), json: () => Promise.resolve(body) } as Response);
    }
    if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
      const ok = handlers.categoryMappingOk !== false;
      return Promise.resolve({ ok, json: () => Promise.resolve(ok ? { updated_count: 1 } : { error: '실패' }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: handlers.existingCuration ?? null }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations')) {
      const ok = handlers.curationSaveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { item: { id: 'curation-1' } } : { error: '저장 실패' }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('BlogCurationModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('열리자마자(On-Demand) 스팟명으로 블로그 검색을 자동 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
      expect(call).toBeDefined();
      expect(decodeURIComponent(call![0] as string)).toContain('query=행복키즈카페');
    });
    expect(await screen.findByText('행복키즈카페 다녀왔어요')).toBeInTheDocument();
  });

  // [최신성 검증(1년 룰)](사용자 지시 원문): "3개 모두 1년 이상 지난 글이면.. 경고
  // 뱃지를 표시함."
  it('3개 모두 1년 이상 지난 글이면 경고 뱃지를 보여준다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ isRecent: false }), makeBlogItem({ isRecent: false, link: 'b' })],
        hasRecentReview: false,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    expect(await screen.findByText('⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토')).toBeInTheDocument();
  });

  it('최근 1년 이내 글이 하나라도 있으면 경고 뱃지를 보여주지 않는다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ isRecent: true })], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    expect(screen.queryByText('⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토')).not.toBeInTheDocument();
  });

  it('탭을 누르면 해당 블로그의 본문(하이라이팅 포함)이 뷰어에 렌더링된다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [
          makeBlogItem({ title: '첫번째 글', description: '주차장 넓어요' }),
          makeBlogItem({ link: 'https://blog.naver.com/abc/2', title: '두번째 글', description: '유모차반입 가능해요' }),
        ],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('첫번째 글');
    expect(screen.getByText('주차장')).toBeInTheDocument(); // <mark>로 감싸진 키워드

    fireEvent.click(screen.getByText('블로그 2'));

    expect(await screen.findByText('두번째 글')).toBeInTheDocument();
    expect(screen.getByText('유모차반입')).toBeInTheDocument();
  });

  it('원문 보기 링크는 해당 탭의 블로그 URL로 새 창을 연다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ link: 'https://blog.naver.com/xyz/1' })], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    const link = await screen.findByText('원문 보기 ↗');
    expect(link).toHaveAttribute('href', 'https://blog.naver.com/xyz/1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('뱃지를 선택하고 저장하면 blog_url 3개(본문 제외)와 badges를 spot_curations에 저장한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [
          makeBlogItem({ link: 'https://blog.naver.com/1' }),
          makeBlogItem({ link: 'https://blog.naver.com/2' }),
          makeBlogItem({ link: 'https://blog.naver.com/3' }),
        ],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={onClose} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    fireEvent.click(screen.getByText('주차 완비'));
    fireEvent.click(screen.getByText('유모차 가능'));
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toEqual({
      spot_id: 'spot-1',
      blog_url_1: 'https://blog.naver.com/1',
      blog_url_2: 'https://blog.naver.com/2',
      blog_url_3: 'https://blog.naver.com/3',
      curation_badges: ['parking', 'stroller'],
    });
    // 본문(description)은 어디에도 전송되지 않는다(저장/폐기 정책).
    expect(JSON.stringify(body)).not.toContain('주차장이 넓고');
  });

  it('노출 중분류를 바꾸고 저장하면 bulk-category-mapping을 ids:[spot.id]로 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onServiceCategoryUpdated = vi.fn();
    render(
      <BlogCurationModal
        spot={SPOT}
        serviceCategories={SERVICE_CATEGORIES}
        onClose={vi.fn()}
        onServiceCategoryUpdated={onServiceCategoryUpdated}
      />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'svc-1' } });
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onServiceCategoryUpdated).toHaveBeenCalledWith('spot-1', 'svc-1'));
    const mappingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/bulk-category-mapping'));
    expect(mappingCall).toBeDefined();
    expect(JSON.parse((mappingCall![1] as RequestInit).body as string)).toEqual({
      ids: ['spot-1'],
      service_category_id: 'svc-1',
    });
  });

  it('이미 큐레이션이 있으면 뱃지를 프리필하고 저장 시 PATCH를 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      existingCuration: { id: 'existing-1', spot_id: 'spot-1', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['parking'] },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    await waitFor(() => expect(screen.getByText('주차 완비').closest('label')).toHaveClass('bg-gray-900'));

    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall![1] as RequestInit).body as string).id).toBe('existing-1');
    });
  });
});
