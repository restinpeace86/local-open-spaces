import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NearbyItem } from '@/lib/spaces/get-nearby';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ center: { lat: 37.5665, lng: 126.978 } }),
}));

function makeSpaceItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '테스트 공간',
    category: 'OUTDOOR_NATURE',
    distance_meters: 0,
    item_type: 'SPACE',
    lng: 127,
    lat: 37.5,
    address: '서울특별시 강남구 어딘가',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: null,
    ...overrides,
  };
}

// Task 9-1-10: /region 상단 필터 칩을 레거시(공원/체육시설/문화기반시설) 대신 5대 UI
// 카테고리(체험·클래스/야외·자연/전시·박물관/공연·축제/키즈·액티비티)로 교체한 것을 검증한다.
describe('RegionGridView 카테고리 칩 (Task 9-1-10)', () => {
  afterEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.doUnmock('@/lib/spaces/get-all-spaces');
    vi.resetModules();
  });

  it('레거시 카테고리(공원/체육시설) 대신 5대 UI 카테고리 칩을 노출한다', async () => {
    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([makeSpaceItem()]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    await waitFor(() => expect(screen.getByText('테스트 공간')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: '야외·자연' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키즈·액티비티' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공원' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '체육시설' })).not.toBeInTheDocument();
  });

  it('카테고리 칩 클릭 시 즉시 해당 카테고리로 데이터가 필터링된다', async () => {
    const nature = makeSpaceItem({ id: 'nature-1', name: '야외 공간', category: 'OUTDOOR_NATURE' });
    const kids = makeSpaceItem({ id: 'kids-1', name: '키즈 공간', category: 'KIDS_ACTIVITY' });

    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([nature, kids]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    await waitFor(() => expect(screen.getByText('야외 공간')).toBeInTheDocument());
    expect(screen.getByText('키즈 공간')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '키즈·액티비티' }));

    expect(screen.queryByText('야외 공간')).not.toBeInTheDocument();
    expect(screen.getByText('키즈 공간')).toBeInTheDocument();
  });

  it('?category= URL 파라미터로 진입하면 해당 칩이 처음부터 활성화되고 데이터도 그 카테고리로 필터링된다', async () => {
    mockSearchParams = new URLSearchParams('category=KIDS_ACTIVITY');
    const nature = makeSpaceItem({ id: 'nature-1', name: '야외 공간', category: 'OUTDOOR_NATURE' });
    const kids = makeSpaceItem({ id: 'kids-1', name: '키즈 공간', category: 'KIDS_ACTIVITY' });

    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([nature, kids]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    await waitFor(() => expect(screen.getByText('키즈 공간')).toBeInTheDocument());
    expect(screen.queryByText('야외 공간')).not.toBeInTheDocument();

    const activeChip = screen.getByRole('button', { name: '키즈·액티비티' });
    expect(activeChip).toHaveStyle({ color: 'rgb(255, 255, 255)' });
  });
});
