import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// [스팟/이벤트 상세 "주변 주차장/식당" 섹션](2026-10-02 사용자 지시, 2026-10-20
// 아코디언 폐기로 변경): 클릭해서 펼치던 토글을 없애고, 후보가 있으면 처음부터
// 직선거리 기준 카드 목록까지 바로 보여준다("지금은 직선거리 기반 직경거리로
// 해" — 2026-10-02, 도보거리 API 호출 제거는 그대로 유지).
const getNearbyParkingLots = vi.fn();
const getNearbyKidsRestaurants = vi.fn();
const getMatchedParkingLot = vi.fn();
const getSpotParkingId = vi.fn();

vi.mock('@/lib/spaces/get-nearby', () => ({
  getNearbyParkingLots: (...args: unknown[]) => getNearbyParkingLots(...args),
  getNearbyKidsRestaurants: (...args: unknown[]) => getNearbyKidsRestaurants(...args),
  getMatchedParkingLot: (...args: unknown[]) => getMatchedParkingLot(...args),
  getSpotParkingId: (...args: unknown[]) => getSpotParkingId(...args),
}));

const PARKING_LOT = {
  id: 'parking-1',
  name: '테스트 공영주차장',
  address: '서울 어딘가',
  distance_meters: 320,
  lng: 127.001,
  lat: 37.501,
  capacity: 50,
  fee_type: '유료',
  base_minutes: 30,
  base_fee: 500,
  extra_unit_minutes: 10,
  extra_unit_fee: 200,
  day_pass_hours: null,
  day_pass_fee: null,
  monthly_fee: null,
  payment_methods: null,
  notes: null,
  phone: null,
  has_disabled_parking: null,
  data_reference_date: null,
  is_multi_child_discount: false,
  discount_info: null,
  realtime_available_count: null,
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

  it('후보가 있으면 헤더와 카드 목록을 처음부터 함께 보여준다(클릭 불필요)', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([RESTAURANT]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} name="2026 인사동 엔틱&아트페어" originTable="open_spaces" originId="spot-origin" />);

    expect(await screen.findByText('🅿️ 주변 공영주차장 (1곳)')).toBeInTheDocument();
    expect(screen.getByText('🍽️ 주변 키즈친화 식당 (1곳)')).toBeInTheDocument();
    expect(await screen.findByText(/테스트 공영주차장/)).toBeInTheDocument();
    expect(screen.getByText(/키즈랜드 푸드/)).toBeInTheDocument();
  });

  it('후보가 0건이면 섹션 자체를 숨긴다', async () => {
    getNearbyParkingLots.mockResolvedValue([]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} name="2026 인사동 엔틱&아트페어" originTable="open_spaces" originId="spot-origin" />);

    await waitFor(() => expect(getNearbyParkingLots).toHaveBeenCalled());
    expect(screen.queryByText(/주변 공영주차장/)).not.toBeInTheDocument();
    expect(screen.queryByText(/주변 키즈친화 식당/)).not.toBeInTheDocument();
  });

  it('처음부터 직선거리 기준 카드 목록을 보여준다(도보거리 API는 호출하지 않는다)', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    const fetchMock = mockFetchRouter();
    vi.stubGlobal('fetch', fetchMock);

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(<NearbyAmenitiesSection lat={37.5} lng={127.0} name="2026 인사동 엔틱&아트페어" originTable="open_spaces" originId="spot-origin" />);

    expect(await screen.findByText(/테스트 공영주차장/)).toBeInTheDocument();
    expect(screen.getByText(/직선거리 320m/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/nearby/walking-distance'), expect.anything());
  });

  // [길찾기 출발지/이동수단 버그 수정](2026-10-02 사용자 지시): "길찾기하면 카카오
  // 네비로 넘어오고 출발지가 현재위치기준으로 잡혀있네... 목적지가 출발지가 되어야
  // 하고 그 주변식당이 도착지가 되어야하지. 그리고... default가 차로 되어있는데
  // 도보 선택해줄수있어?" — 길찾기 링크가 (1) 현재 보고 있는 스팟/이벤트를
  // 출발지로, 주차장/식당을 도착지로 명시하고 (2) 이동수단을 도보(walk)로
  // 지정하는지 검증한다.
  it('길찾기 링크는 현재 스팟/이벤트를 출발지로, 도보 모드로 지정한다', async () => {
    getNearbyParkingLots.mockResolvedValue([PARKING_LOT]);
    getNearbyKidsRestaurants.mockResolvedValue([]);
    vi.stubGlobal('fetch', mockFetchRouter());

    const { NearbyAmenitiesSection } = await import('./nearby-amenities-section');
    render(
      <NearbyAmenitiesSection
        lat={37.5}
        lng={127.0}
        name="2026 인사동 엔틱&아트페어"
        originTable="events"
        originId="event-1"
      />
    );

    await screen.findByText('🅿️ 주변 공영주차장 (1곳)');
    const link = await screen.findByText('길찾기 ↗');

    expect(link).toHaveAttribute(
      'href',
      `https://map.kakao.com/link/by/walk/${encodeURIComponent('2026 인사동 엔틱&아트페어')},37.5,127/${encodeURIComponent('테스트 공영주차장')},37.501,127.001`
    );
  });

});
