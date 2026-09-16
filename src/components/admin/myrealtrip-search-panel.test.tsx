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
  linkedByGid?: Record<string, string>;
  spotSearchResults?: Array<{ id: string; name: string; address: string | null }>;
  connectOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-myrealtrip-link/by-gids')) {
      const links = Object.entries(handlers.linkedByGid ?? {}).map(([gid, spot_name]) => ({ gid, spot_id: 'spot-x', spot_name }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ links }) } as Response);
    }
    if (url.includes('/api/admin/spot-myrealtrip-link') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      if (handlers.connectOk === false) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '연결에 실패했습니다.' }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ link: { gid: body.gid, item_name: body.item_name, mylink: 'https://myrealt.rip/qnew' } }),
      } as Response);
    }
    if (url.includes('/api/spots/search-external')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/spots/search')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.spotSearchResults ?? [] }) } as Response);
    }
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
    if (url.includes('/api/admin/data-grid/space-link')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ space: { id: 'spot-9', name: '숲속 키즈카페', standard_name: null, service_category_id: null } }),
      } as Response);
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

// [실측 버그 수정](2026-09-16 사용자 지적: "도시를 서울로 한 상태에서 검색해도
// 서울하고 무관한 상품들이 많이 나오는데?") — 공식 검색 API에는 city 파라미터가
// 없어 도시가 검색어에 합쳐지지 않으면 전혀 반영되지 않는다(실측으로 인천/대전/
// 해외 상품까지 섞여 나오는 것을 확인).
it('검색 시 도시를 키워드 앞에 자동으로 합쳐서 보낸다', async () => {
  const fetchMock = mockFetch({ searchItems: [] });
  vi.stubGlobal('fetch', fetchMock);
  render(<MyRealTripSearchPanel />); // 기본 도시: 서울

  fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '키즈 체험' } });
  fireEvent.click(screen.getByText('검색'));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/myrealtrip/search'));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string).keyword).toBe('서울 키즈 체험');
  });
});

it('키워드에 이미 도시명이 포함돼 있으면 중복으로 합치지 않는다', async () => {
  const fetchMock = mockFetch({ searchItems: [] });
  vi.stubGlobal('fetch', fetchMock);
  render(<MyRealTripSearchPanel />);

  fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '서울 키즈 체험' } });
  fireEvent.click(screen.getByText('검색'));

  await waitFor(() => {
    const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/myrealtrip/search'));
    expect(JSON.parse((call![1] as RequestInit).body as string).keyword).toBe('서울 키즈 체험');
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

// [마이리얼트립 상품 → 우리 스팟 역방향 매칭](2026-09-16 사용자 지시): "몇백개의
// 키즈카페 중에 마이리얼트립에 있는건 46개.. 46개에 대하여 우리쪽 연결하고 그
// 연결한건 안나와서 내가 연결했다는걸 인지할수 있는것.. 소거법으로 가야하지
// 않을까?" 단위 테스트.
describe('마이리얼트립 상품 → 우리 스팟 연결 (소거법, 2026-09-16)', () => {
  async function search() {
    render(<MyRealTripSearchPanel />);
    fireEvent.change(screen.getByPlaceholderText('검색 키워드 (예: 서울 키즈 체험)'), { target: { value: '서울 키즈' } });
    fireEvent.click(screen.getByText('검색'));
    await screen.findByText('[키즈] 국립중앙박물관 초등 도슨트 투어');
  }

  it('이미 연결된 상품은 카드에 "✅ {스팟명}에 연결됨"으로 표시된다', async () => {
    vi.stubGlobal('fetch', mockFetch({ searchItems: [buildSearchItem()], linkedByGid: { '5905493': '숲속 키즈카페' } }));
    await search();

    expect(await screen.findByText('✅ 숲속 키즈카페에 연결됨')).toBeInTheDocument();
    expect(screen.getByText(/연결됨 1건/)).toBeInTheDocument();
  });

  it('연결 안 된 상품은 상세에서 "우리 스팟과 연결" 버튼으로 우리 스팟을 검색해 연결할 수 있다', async () => {
    const fetchMock = mockFetch({
      searchItems: [buildSearchItem()],
      spotSearchResults: [{ id: 'spot-9', name: '숲속 키즈카페', address: '경기 성남시' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    await search();

    fireEvent.click(screen.getByText('[키즈] 국립중앙박물관 초등 도슨트 투어'));
    fireEvent.click(await screen.findByText('🔗 우리 스팟과 연결'));

    fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 키즈카페' } });
    fireEvent.mouseDown(await screen.findByText('숲속 키즈카페'));
    fireEvent.click(screen.getByText('이 스팟과 연결 (마이링크 자동 생성)'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string).includes('/api/admin/spot-myrealtrip-link') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({ spot_id: 'spot-9', gid: '5905493' });
    });
    // 연결 성공 후 소거(연결됨으로 표시)됐는지 확인한다.
    expect(await screen.findByText('✅ 숲속 키즈카페에 연결됨')).toBeInTheDocument();
  });

  it('연결에 실패하면 에러 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        searchItems: [buildSearchItem()],
        spotSearchResults: [{ id: 'spot-9', name: '숲속 키즈카페', address: null }],
        connectOk: false,
      })
    );
    await search();

    fireEvent.click(screen.getByText('[키즈] 국립중앙박물관 초등 도슨트 투어'));
    fireEvent.click(await screen.findByText('🔗 우리 스팟과 연결'));
    fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 키즈카페' } });
    fireEvent.mouseDown(await screen.findByText('숲속 키즈카페'));
    fireEvent.click(screen.getByText('이 스팟과 연결 (마이링크 자동 생성)'));

    expect(await screen.findByText('연결에 실패했습니다.')).toBeInTheDocument();
  });

  // [스팟 연결 후 등록 시 중복 작업 제거](2026-09-16 사용자 보고): "마이리얼트립
  // 에서 들어가면 내스팟과 연결있는데 그거하고나서 등록버튼 누르고 제휴마케팅
  // 만들기 들어가면 스팟연결안되어있어서 거기서 다시하고.. 그래서 2번하는걸로
  // 되나?" — "우리 스팟과 연결"로 이미 연결한 상품을 그 뒤에 "제휴 상품으로
  // 등록"하면, 등록 폼에서 스팟을 또 검색하지 않아도 이미 연동된 상태여야 한다.
  it('스팟을 연결한 뒤 "제휴 상품으로 등록"을 누르면 등록 폼에 그 스팟이 이미 연동돼 있다', async () => {
    const fetchMock = mockFetch({
      searchItems: [buildSearchItem()],
      spotSearchResults: [{ id: 'spot-9', name: '숲속 키즈카페', address: '경기 성남시' }],
      mylink: 'https://myrealt.rip/qamObf',
    });
    vi.stubGlobal('fetch', fetchMock);
    await search();

    fireEvent.click(screen.getByText('[키즈] 국립중앙박물관 초등 도슨트 투어'));
    fireEvent.click(await screen.findByText('🔗 우리 스팟과 연결'));
    fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 키즈카페' } });
    fireEvent.mouseDown(await screen.findByText('숲속 키즈카페'));
    fireEvent.click(screen.getByText('이 스팟과 연결 (마이링크 자동 생성)'));
    await screen.findByText('✅ 숲속 키즈카페에 연결됨');

    fireEvent.click(screen.getByText('🔗 제휴 상품으로 등록'));
    await screen.findByDisplayValue('https://myrealt.rip/qamObf');

    // 등록 폼(CuratedItemFormModal) 안에서 스팟을 다시 검색하지 않아도 이미
    // "숲속 키즈카페"가 선택된 상태(변경 버튼 존재, 검색창은 없음)여야 한다.
    expect(screen.getByText('변경')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/장소명 3글자 이상/)).not.toBeInTheDocument();
  });
});
