import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyRealTripSearchPanel } from './myrealtrip-search-panel';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시): "일단 관리자용에
// 구현해보자.. 탭 하나 파거나.. 데이터 나오는 걸 보고 축소하든 결정하든 해야할거
// 같아" — 이후 "상품리스트 보고.. 상품 상세 들어가서 해당 상품에 대하여
// 제휴상품으로 등록하는 흐름으로" 지시로 카드 → 상세 → 마이링크 생성 → 등록
// 순서로 바뀌었다. 단위 테스트.
function mockFetch(handlers: {
  categories?: Array<{ name: string; value: string }>;
  searchItems?: unknown[];
  searchTotalCount?: number;
  searchError?: string;
  detail?: Record<string, unknown>;
  detailError?: string;
  mylink?: string;
  mylinkError?: string;
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
    if (url.includes('/api/admin/myrealtrip/detail')) {
      if (handlers.detailError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: handlers.detailError }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            gid: '5905493',
            title: '',
            description: '<p>야간 투어 설명</p>',
            reviewScore: 4.9,
            reviewCount: 120,
            included: ['워킹 투어'],
            excluded: ['팁'],
            itineraries: [],
            ...handlers.detail,
          }),
      } as Response);
    }
    if (url.includes('/api/admin/myrealtrip/mylink')) {
      if (handlers.mylinkError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: handlers.mylinkError }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mylink: handlers.mylink ?? 'https://myrealt.rip/qamObf', mylinkId: 4837493 }),
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

// [상품 상세 → 제휴 등록 흐름](2026-09-16 후속 지시): "상품리스트 보고.. 상품
// 상세 들어가서 해당 상품에 대하여 제휴상품으로 등록하는 흐름으로"
describe('상품 상세 → 제휴 등록', () => {
  async function searchAndOpenDetail() {
    render(<MyRealTripSearchPanel />);
    fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '서울 키즈' } });
    fireEvent.click(screen.getByText('검색'));
    const card = await screen.findByText('[키즈] 국립중앙박물관 초등 도슨트 투어');
    fireEvent.click(card);
  }

  it('카드를 누르면 상세 모달이 열려 설명/포함·불포함 사항을 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()] }));
    await searchAndOpenDetail();

    expect(await screen.findByText(/야간 투어 설명/)).toBeInTheDocument();
    expect(screen.getByText(/워킹 투어/)).toBeInTheDocument();
    expect(screen.getByText(/팁/)).toBeInTheDocument();
  });

  it('"🔗 제휴 상품으로 등록"을 누르면 마이링크를 생성해 그 값으로 등록 폼을 연다', async () => {
    const fetchMock = mockFetch({ searchItems: [buildSearchItem()], mylink: 'https://myrealt.rip/qamObf' });
    vi.stubGlobal('fetch', fetchMock);
    await searchAndOpenDetail();
    await screen.findByText(/야간 투어 설명/);

    fireEvent.click(screen.getByText('🔗 제휴 상품으로 등록'));

    await waitFor(() => {
      const mylinkCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/myrealtrip/mylink'));
      expect(mylinkCall).toBeDefined();
      expect(JSON.parse((mylinkCall![1] as RequestInit).body as string)).toEqual({ targetUrl: 'https://experiences.myrealtrip.com/products/5905493' });
    });

    // 등록 폼에는 마이링크(원본 productUrl이 아님)가 booking_url로 채워져야 한다.
    expect(await screen.findByDisplayValue('https://myrealt.rip/qamObf')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://experiences.myrealtrip.com/products/5905493')).not.toBeInTheDocument();
  });

  it('마이링크 생성이 실패하면 에러를 보여주고, 원본 링크로 등록하는 대안을 제공한다', async () => {
    vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()], mylinkError: '마이링크 생성에 실패했습니다.' }));
    await searchAndOpenDetail();
    await screen.findByText(/야간 투어 설명/);

    fireEvent.click(screen.getByText('🔗 제휴 상품으로 등록'));
    expect(await screen.findByText('마이링크 생성에 실패했습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('추적 없이 원본 링크로 등록(수익 정산 안 됨)'));
    expect(await screen.findByDisplayValue('https://experiences.myrealtrip.com/products/5905493')).toBeInTheDocument();
  });

  it('상세 조회에 실패해도 등록 흐름 자체는 막지 않는다(에러만 표시)', async () => {
    vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()], detailError: '상품 상세 조회에 실패했습니다.' }));
    await searchAndOpenDetail();

    expect(await screen.findByText('상품 상세 조회에 실패했습니다.')).toBeInTheDocument();
    expect(screen.getByText('🔗 제휴 상품으로 등록')).toBeInTheDocument();
  });
});
