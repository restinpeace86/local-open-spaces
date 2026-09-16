import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotMyRealTripLinkEditor } from './spot-myrealtrip-link-editor';

// [스팟 상세 → 마이리얼트립 자동 매칭](2026-09-16 사용자 지시): "관리자가 승인을
// 한 번 거치기"로 확정된 흐름의 단위 테스트.
function mockFetch(handlers: {
  existingLink?: Record<string, unknown> | null;
  searchItems?: unknown[];
  approveOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-myrealtrip-link') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ link: handlers.existingLink ?? null }) } as Response);
    }
    if (url.includes('/api/admin/myrealtrip/search')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.searchItems ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-myrealtrip-link') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      if (handlers.approveOk === false) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '매칭 승인에 실패했습니다.' }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            link: { gid: body.gid, item_name: body.item_name, image_url: body.image_url, price_display: body.price_display, product_url: body.product_url, mylink: 'https://myrealt.rip/qamObf' },
          }),
      } as Response);
    }
    if (url.includes('/api/admin/spot-myrealtrip-link') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function buildSearchItem(overrides: Record<string, unknown> = {}) {
  return {
    gid: '5905493',
    itemName: '숲속 키즈카페',
    description: '서울 ∙ 키즈',
    salePrice: 15000,
    priceDisplay: '15,000원',
    category: '키즈',
    reviewScore: 4.8,
    reviewCount: 30,
    imageUrl: 'https://example.com/img.jpg',
    productUrl: 'https://experiences.myrealtrip.com/products/5905493',
    deepLink: 'mrt://experiences/detail/5905493',
    tags: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('이미 승인된 매칭이 있으면 그 정보를 보여주고 검색 UI는 숨긴다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ existingLink: { gid: 'g1', item_name: '숲속 키즈카페', image_url: null, price_display: '15,000원', product_url: 'https://x', mylink: 'https://myrealt.rip/x' } })
  );
  render(<SpotMyRealTripLinkEditor spotId="spot-1" spotName="숲속 키즈카페" />);

  expect(await screen.findByText('숲속 키즈카페')).toBeInTheDocument();
  expect(screen.queryByText('🔍 검색')).not.toBeInTheDocument();
});

it('매칭이 없으면 스팟명으로 검색할 수 있고, 승인하면 마이링크가 생성돼 저장된다', async () => {
  const fetchMock = mockFetch({ existingLink: null, searchItems: [buildSearchItem()] });
  vi.stubGlobal('fetch', fetchMock);
  render(<SpotMyRealTripLinkEditor spotId="spot-1" spotName="숲속 키즈카페" />);

  await waitFor(() => expect(screen.queryByText('마이리얼트립 매칭 확인 중...')).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('🔍 검색'));

  expect(await screen.findByText('이 상품으로 승인')).toBeInTheDocument();
  fireEvent.click(screen.getByText('이 상품으로 승인'));

  await waitFor(() => {
    const postCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/api/admin/spot-myrealtrip-link') && (c[1] as RequestInit)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toMatchObject({ spot_id: 'spot-1', gid: '5905493' });
  });
  // 승인 후에는 검색 UI가 사라지고 승인된 매칭 표시로 바뀐다.
  expect(await screen.findByText('매칭 해제')).toBeInTheDocument();
});

it('승인이 실패하면 에러 메시지를 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetch({ existingLink: null, searchItems: [buildSearchItem()], approveOk: false }));
  render(<SpotMyRealTripLinkEditor spotId="spot-1" spotName="숲속 키즈카페" />);

  await waitFor(() => expect(screen.queryByText('마이리얼트립 매칭 확인 중...')).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('🔍 검색'));
  await screen.findByText('이 상품으로 승인');
  fireEvent.click(screen.getByText('이 상품으로 승인'));

  expect(await screen.findByText('매칭 승인에 실패했습니다.')).toBeInTheDocument();
});

it('매칭 해제를 누르면 다시 검색 UI로 돌아간다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetch({ existingLink: { gid: 'g1', item_name: '숲속 키즈카페', image_url: null, price_display: '15,000원', product_url: 'https://x', mylink: 'https://myrealt.rip/x' } })
  );
  render(<SpotMyRealTripLinkEditor spotId="spot-1" spotName="숲속 키즈카페" />);

  fireEvent.click(await screen.findByText('매칭 해제'));

  await waitFor(() => expect(screen.getByText('🔍 검색')).toBeInTheDocument());
});
