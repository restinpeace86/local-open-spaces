import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언](2026-10-02 사용자 지시) 테스트:
// 접힌 상태는 직선거리 개수만 표시, 펼치면 직선거리 기준 카드 목록을 보여준다
// ("지금은 직선거리 기반 직경거리로 해" — 2026-10-02, 도보거리 API 호출 제거).
const getNearbyParkingLots = vi.fn();
const getNearbyKidsRestaurants = vi.fn();

vi.mock('@/lib/spaces/get-nearby', () => ({
  getNearbyParkingLots: (...args: unknown[]) => getNearbyParkingLots(...args),
  getNearbyKidsRestaurants: (...args: unknown[]) => getNearbyKidsRestaurants(...args),
}));

const PARKING_LOT = {
  id: 1,
  name: '테스트 공영주차장',
  address: '서울 어딘가',
  distance_meters: 320,
  lng: 127.001,
  lat: 37.501,
  is_paid: true,
  total_capacity: 50,
  tel: null,
};

const RESTAURANT = {
  id: 'spot-1',
  name: '키즈랜드 푸드',
  category: '놀이방식당',
  distance_meters: 400,
  item_type: 'SPACE' as const,
  lng: 127.002,
  lat: 37.502,
  address: '서울 어딘가',
  thumbnail_url: null,
  start_date: null,
  end_date: null,
  reservation_start_date: null,
  reservation_end_date: null,
  reservation_url: null,
  is_reservation_required: null,
  operating_hours: null,
  is_free: null,
  info_url: null,
  is_kids_friendly: true,
  has_parking: null,
  stroller_accessible: null,
  facility_type: null,
  target_age_group: null,
  booking_status: null,
};

function mockFetchRouter({ badges = {} }: { badges?: Record<string, unknown> } = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/nearby/spot-badges')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ badges }) } as Response);
    }
    return Promise.reject(new Error(`예상치 못한 fetch 호출: ${url}`));
  });
}

describe('NearbyAmenitiesSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('후보가 있으면 접힌 상태로 개수만 표시한다', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([RESTAURANT]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} originTable="open_spaces" originId="spot-origin" />);

    expect(await screen.findByText('🅿️ 주변 공영주차장 (1곳)')).toBeInTheDocument();
    expect(screen.getByText('🍽️ 주변 키즈친화 식당 (1곳)')).toBeInTheDocument();
    expect(screen.queryByText(/테스트 공영주차장/)).not.toBeInTheDocument();
  });

  it('후보가 0건이면 아코디언 자체를 숨긴다', async () => {
    getNearbyParkingLots.mockResolvedValue([]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} originTable="open_spaces" originId="spot-origin" />);

    await waitFor(() => expect(getNearbyParkingLots).toHaveBeenCalled());
    expect(screen.queryByText(/주변 공영주차장/)).not.toBeInTheDocument();
    expect(screen.queryByText(/주변 키즈친화 식당/)).not.toBeInTheDocument();
  });

  it('펼치면 직선거리 기준 카드 목록을 보여준다(도보거리 API는 호출하지 않는다)', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    const fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} originTable="open_spaces" originId="spot-origin" />);

    const toggle = await screen.findByText('🅿️ 주변 공영주차장 (1곳)');
    fireEvent.click(toggle);

    expect(await screen.findByText(/테스트 공영주차장/)).toBeInTheDocument();
    expect(screen.getByText(/직선 320m/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/nearby/walking-distance'), expect.anything());
  });

  it('다시 누르면 접혀서 카드 목록이 사라진다', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} originTable="open_spaces" originId="spot-origin" />);

    const toggle = await screen.findByText('🅿️ 주변 공영주차장 (1곳)');
    fireEvent.click(toggle);
    expect(await screen.findByText(/테스트 공영주차장/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText(/테스트 공영주차장/)).not.toBeInTheDocument();
  });
});
