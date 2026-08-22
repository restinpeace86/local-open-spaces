import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NearbyItem } from '@/lib/spaces/get-nearby';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

let mockSigunguName: string | null = null;
vi.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ center: { lat: 37.5665, lng: 126.978 }, sigunguName: mockSigunguName }),
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
    sigungu_name: '강남구',
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

// Task 9-1-4: /region 탭 진입 시 5대 카테고리 선택 화면(1단계)을 먼저 보여주고, 선택해야만
// 해당 카테고리 리스트(2단계)가 노출되는지, 그리고 전역 고정 위치가 우선 노출에 반영되는지 검증한다.
describe('RegionGridView 2단계 탐색 UX (Task 9-1-4)', () => {
  afterEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSigunguName = null;
    vi.doUnmock('@/lib/spaces/get-all-spaces');
    vi.resetModules();
  });

  it('카테고리 없이 진입하면 1단계(카테고리 선택 화면)만 보이고 리스트는 아직 없다', async () => {
    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([makeSpaceItem()]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    expect(screen.getByText('카테고리를 선택해주세요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키즈·액티비티' })).toBeInTheDocument();
    expect(screen.queryByText('테스트 공간')).not.toBeInTheDocument();
  });

  it('카테고리 타일을 클릭하면 2단계로 넘어가 해당 카테고리 리스트만 보여준다', async () => {
    const nature = makeSpaceItem({ id: 'nature-1', name: '야외 공간', category: 'OUTDOOR_NATURE' });
    const kids = makeSpaceItem({ id: 'kids-1', name: '키즈 공간', category: 'KIDS_ACTIVITY' });

    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([nature, kids]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    fireEvent.click(screen.getByRole('button', { name: '키즈·액티비티' }));

    await waitFor(() => expect(screen.getByText('키즈 공간')).toBeInTheDocument());
    expect(screen.queryByText('야외 공간')).not.toBeInTheDocument();
    expect(screen.queryByText('카테고리를 선택해주세요')).not.toBeInTheDocument();
  });

  it('?category= URL로 진입하면 1단계를 건너뛰고 바로 2단계 리스트를 보여준다', async () => {
    mockSearchParams = new URLSearchParams('category=KIDS_ACTIVITY');
    const nature = makeSpaceItem({ id: 'nature-1', name: '야외 공간', category: 'OUTDOOR_NATURE' });
    const kids = makeSpaceItem({ id: 'kids-1', name: '키즈 공간', category: 'KIDS_ACTIVITY' });

    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([nature, kids]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    expect(screen.queryByText('카테고리를 선택해주세요')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('키즈 공간')).toBeInTheDocument());
    expect(screen.queryByText('야외 공간')).not.toBeInTheDocument();
  });

  it('"← 다른 카테고리"를 누르면 다시 1단계 선택 화면으로 돌아간다', async () => {
    mockSearchParams = new URLSearchParams('category=KIDS_ACTIVITY');
    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([makeSpaceItem({ category: 'KIDS_ACTIVITY' })]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    await waitFor(() => expect(screen.getByText('테스트 공간')).toBeInTheDocument());

    fireEvent.click(screen.getByText('← 다른 카테고리'));

    expect(screen.getByText('카테고리를 선택해주세요')).toBeInTheDocument();
  });

  it('전역 고정 위치(sigunguName)와 일치하는 항목을 우선 노출한다(다른 지역도 배제하지 않음)', async () => {
    mockSearchParams = new URLSearchParams('category=KIDS_ACTIVITY');
    mockSigunguName = '성남시 분당구';

    const other = makeSpaceItem({
      id: 'other',
      name: '강남 키즈 공간',
      category: 'KIDS_ACTIVITY',
      address: '서울특별시 강남구 어딘가',
      sigungu_name: '강남구',
    });
    const matching = makeSpaceItem({
      id: 'matching',
      name: '분당 키즈 공간',
      category: 'KIDS_ACTIVITY',
      address: '경기도 성남시 분당구 어딘가',
      sigungu_name: '성남시 분당구',
    });

    vi.doMock('@/lib/spaces/get-all-spaces', () => ({
      getAllOpenSpaces: () => Promise.resolve([other, matching]),
    }));

    const { RegionGridView: FreshView } = await import('./region-grid-view');
    render(<FreshView />);

    await waitFor(() => expect(screen.getByText('분당 키즈 공간')).toBeInTheDocument());
    // 다른 지역도 여전히 노출된다(배제하지 않음).
    expect(screen.getByText('강남 키즈 공간')).toBeInTheDocument();

    const cardTexts = screen.getAllByText(/키즈 공간$/).map((el) => el.textContent);
    expect(cardTexts[0]).toBe('분당 키즈 공간');
  });
});
