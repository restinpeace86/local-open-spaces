import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from './home-view';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { HomeFeed } from '@/lib/home/get-home-feed';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

vi.mock('@/lib/kakao/directions-url', () => ({
  buildKakaoDirectionsUrl: () => 'https://map.kakao.com/',
}));

function makeEventItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'event-1',
    name: '오늘의 추천 행사',
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: '2026-08-22',
    end_date: '2026-08-22',
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: '오늘방문',
    ...overrides,
  };
}

function makeSpaceItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '무료 공공 공원',
    category: 'OUTDOOR_NATURE',
    distance_meters: -1,
    item_type: 'SPACE',
    lng: 127,
    lat: 37.5,
    address: '서울시 어딘가',
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

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Hero Carousel/Quick 그리드/0원의 행복 피드를 홈 탭에서 렌더링한다', () => {
    const feed: HomeFeed = { heroEvents: [makeEventItem()], freeFeed: [makeSpaceItem()] };
    render(<HomeView initialFeed={feed} />);

    expect(screen.getByText('오늘의 추천 행사')).toBeInTheDocument();
    expect(screen.getByText('🎁 0원의 행복')).toBeInTheDocument();
    expect(screen.getByText('무료 공공 공원')).toBeInTheDocument();
    // 5대 카테고리 Quick 그리드
    expect(screen.getByText('키즈·액티비티')).toBeInTheDocument();
  });

  it('오늘의 추천 행사가 없으면 안내 문구를 보여준다', () => {
    const feed: HomeFeed = { heroEvents: [], freeFeed: [] };
    render(<HomeView initialFeed={feed} />);
    expect(screen.getByText('오늘 진행 중인 추천 행사가 아직 없습니다.')).toBeInTheDocument();
  });

  it('특가·핫딜 서브탭은 비활성화 상태로 노출된다(커머스 API 미연동)', () => {
    const feed: HomeFeed = { heroEvents: [], freeFeed: [] };
    render(<HomeView initialFeed={feed} />);
    const hotdealTab = screen.getByText('🏷️ 특가·핫딜');
    expect(hotdealTab).toHaveAttribute('aria-disabled', 'true');
  });

  it('무료·공공 서브탭 클릭 시 무료 피드만 보여준다', () => {
    const feed: HomeFeed = {
      heroEvents: [makeEventItem()],
      freeFeed: [makeSpaceItem()],
    };
    render(<HomeView initialFeed={feed} />);

    fireEvent.click(screen.getByText('🎁 무료·공공'));

    // 홈 탭 전용 섹션(0원의 행복 헤더, 퀵그리드)은 사라지고 피드 항목만 남는다
    expect(screen.queryByText('🎁 0원의 행복')).not.toBeInTheDocument();
    expect(screen.getByText('무료 공공 공원')).toBeInTheDocument();
  });

  it('카드를 클릭하면 상세 모달이 열린다', () => {
    const feed: HomeFeed = { heroEvents: [], freeFeed: [makeSpaceItem()] };
    render(<HomeView initialFeed={feed} />);

    fireEvent.click(screen.getByText('무료 공공 공원'));

    expect(screen.getAllByText('무료 공공 공원').length).toBeGreaterThan(1);
  });

  // Task 9-1-3: "[장소명] · [시/군/구]" 카드 표기 검증(거리 계산 제거)
  it('venue_name과 sigungu_name이 있으면 "[장소명] · [시/군/구]" 형태로 카드에 표시한다', () => {
    const feed: HomeFeed = {
      heroEvents: [makeEventItem({ address: '율동공원 야외무대', sigungu_name: '성남시 분당구' })],
      freeFeed: [],
    };
    render(<HomeView initialFeed={feed} />);

    expect(screen.getByText('율동공원 야외무대 · 성남시 분당구')).toBeInTheDocument();
  });

  // Task 9-1-3: 유저가 실제 위치를 설정하면(온보딩 확정 시 이미 계산돼 저장된 sigungu_name)
  // 그 값을 그대로 넘겨 홈 피드를 즉시 재조회한다(재계산 없음)
  it('유저 위치가 설정돼 있으면 저장된 sigungu_name으로 /api/home/feed를 재조회한다', async () => {
    localStorage.setItem(
      'user_location',
      JSON.stringify({
        lat: 37.4,
        lng: 127.2,
        address_name: '경기도 성남시 분당구',
        sigungu_name: '성남시 분당구',
      })
    );

    const refetchedFeed: HomeFeed = {
      heroEvents: [makeEventItem({ id: 'refetched', name: '재조회된 행사' })],
      freeFeed: [],
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve(refetchedFeed) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    const initialFeed: HomeFeed = { heroEvents: [makeEventItem()], freeFeed: [] };
    render(<HomeView initialFeed={initialFeed} />);

    expect(await screen.findByText('재조회된 행사')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/home/feed?sigungu=${encodeURIComponent('성남시 분당구')}`
    );

    vi.unstubAllGlobals();
  });
});
