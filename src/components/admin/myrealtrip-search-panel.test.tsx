import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyRealTripSearchPanel } from './myrealtrip-search-panel';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시): "일단 관리자용에
// 구현해보자.. 탭 하나 파거나.. 데이터 나오는 걸 보고 축소하든 결정하든 해야할거
// 같아" 단위 테스트.
function mockFetch(handlers: {
  categories?: Array<{ name: string; value: string }>;
  searchItems?: unknown[];
  searchTotalCount?: number;
  searchError?: string;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/myrealtrip/categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: handlers.categories ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/myrealtrip/search')) {
      if (handlers.searchError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: handlers.searchError }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: handlers.searchItems ?? [], totalCount: handlers.searchTotalCount ?? (handlers.searchItems ?? []).length }),
      } as Response);
    }
    if (url.includes('/api/admin/service-categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}, init: ${JSON.stringify(init)}`));
  });
}

function buildSearchItem(overrides: Record<string, unknown> = {}) {
  return {
    gid: '5905493',
    itemName: '[키즈] 국립중앙박물관 초등 도슨트 투어',
    description: '서울 ∙ 키즈',
    salePrice: 34900,
    priceDisplay: '34,900원',
    category: '키즈',
    reviewScore: 4.9,
    reviewCount: 120,
    imageUrl: 'https://example.com/img.jpg',
    productUrl: 'https://experiences.myrealtrip.com/products/5905493',
    deepLink: 'mrt://experiences/detail/5905493',
    tags: ['즉시 확정'],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('마운트되면 기본 도시(서울)의 카테고리 목록을 불러온다', async () => {
  vi.stubGlobal('fetch', mockFetch({ categories: [{ name: '키즈', value: 'kids' }] }));
  render(<MyRealTripSearchPanel />);

  expect(await screen.findByText('키즈')).toBeInTheDocument();
});

it('도시를 바꾸면 그 도시의 카테고리를 다시 불러온다', async () => {
  const fetchMock = mockFetch({ categories: [{ name: '키즈', value: 'kids' }] });
  vi.stubGlobal('fetch', fetchMock);
  render(<MyRealTripSearchPanel />);
  await screen.findByText('키즈');

  fireEvent.change(screen.getByPlaceholderText('예: 서울, 부산, 제주'), { target: { value: '부산' } });

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/categories') && (c[1] as RequestInit).body?.toString().includes('부산'));
    expect(call).toBeDefined();
  });
});

it('키워드를 입력하고 검색하면 결과 카드를 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()] }));
  render(<MyRealTripSearchPanel />);

  fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '서울 키즈' } });
  fireEvent.click(screen.getByText('검색'));

  expect(await screen.findByText('[키즈] 국립중앙박물관 초등 도슨트 투어')).toBeInTheDocument();
  expect(screen.getByText('34,900원')).toBeInTheDocument();
});

it('검색 실패 시 에러 메시지를 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetch({ searchError: '검색 키워드가 필요합니다.' }));
  render(<MyRealTripSearchPanel />);

  fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '아무거나' } });
  fireEvent.click(screen.getByText('검색'));

  expect(await screen.findByText('검색 키워드가 필요합니다.')).toBeInTheDocument();
});

it('"＋ 큐레이션에 등록"을 누르면 등록 폼이 검색 결과 값으로 채워진 채로 열린다', async () => {
  vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()] }));
  render(<MyRealTripSearchPanel />);

  fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '서울 키즈' } });
  fireEvent.click(screen.getByText('검색'));
  await screen.findByText('[키즈] 국립중앙박물관 초등 도슨트 투어');

  fireEvent.click(screen.getByText('＋ 큐레이션에 등록'));

  expect(await screen.findByDisplayValue('[키즈] 국립중앙박물관 초등 도슨트 투어')).toBeInTheDocument();
  expect(screen.getByDisplayValue('https://experiences.myrealtrip.com/products/5905493')).toBeInTheDocument();
});
