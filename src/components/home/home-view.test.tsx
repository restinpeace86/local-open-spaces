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

  it('Hero Carousel/Quick 그리드/가성비 행복 피드를 홈 탭에서 렌더링한다', () => {
    const feed: HomeFeed = { heroEvents: [makeEventItem()], freeFeed: [makeSpaceItem()] };
    render(<HomeView initialFeed={feed} />);

    expect(screen.getByText('오늘의 추천 행사')).toBeInTheDocument();
    expect(screen.getByText('💰 가성비 행복')).toBeInTheDocument();
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

    // 홈 탭 전용 섹션(가성비 행복 헤더, 퀵그리드)은 사라지고 피드 항목만 남는다
    expect(screen.queryByText('💰 가성비 행복')).not.toBeInTheDocument();
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
  // 그 값을 그대로 넘겨 홈 피드를 즉시 재조회한다(재계산 없음).
  // 사용자 피드백(2026-08-22): 실제 좌표(lat/lng)도 함께 넘겨 서버가 가까운 순으로 재정렬하도록 한다.
  it('유저 위치가 설정돼 있으면 저장된 sigungu_name과 좌표로 /api/home/feed를 재조회한다', async () => {
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
      `/api/home/feed?sigungu=${encodeURIComponent('성남시 분당구')}&lat=37.4&lng=127.2`
    );

    vi.unstubAllGlobals();
  });

  // 사용자 피드백(2026-08-22): 헤더 위치 표기가 상세 도로명주소라서 검색바를 가릴 정도였다 —
  // 짧은 sigunguName을 우선 보여줘야 한다.
  it('헤더 위치 표기는 상세 주소가 아니라 짧은 sigunguName을 보여준다', () => {
    localStorage.setItem(
      'user_location',
      JSON.stringify({
        lat: 37.4,
        lng: 127.2,
        address_name: '경기도 성남시 분당구 판교로 546번길 15 (판교동, 코너스퀘어)',
        sigungu_name: '성남시 분당구',
      })
    );
    // addressName이 채워지면 재조회 useEffect가 fetch를 호출하므로(이 테스트의 관심사가
    // 아니어도) 실제 네트워크 요청이 나가지 않도록 스텁해 둔다.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ heroEvents: [], freeFeed: [] }) } as Response))
    );

    const feed: HomeFeed = { heroEvents: [], freeFeed: [] };
    render(<HomeView initialFeed={feed} />);

    expect(screen.getByText('성남시 분당구')).toBeInTheDocument();
    expect(
      screen.queryByText('경기도 성남시 분당구 판교로 546번길 15 (판교동, 코너스퀘어)')
    ).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  // Task 9-1-9: 메인 카드(Hero Carousel)는 처음 10개만 슬라이드로 보여주고, 11번째 이상은
  // 마지막 슬라이드의 "전체 보기" CTA 카드(지도 화면 연동)로 대체한다(더 이상 아래에 펼치지 않음).
  it('Hero Carousel 항목이 10개를 넘으면 마지막 슬라이드로 "전체 보기" CTA 카드를 보여준다', () => {
    const heroEvents = Array.from({ length: 12 }, (_, i) =>
      makeEventItem({ id: `hero-${i}`, name: `오늘의 행사 ${i}` })
    );
    const feed: HomeFeed = { heroEvents, freeFeed: [] };
    render(<HomeView initialFeed={feed} />);

    expect(screen.getByText('오늘의 행사 0')).toBeInTheDocument();
    expect(screen.getByText('오늘의 행사 9')).toBeInTheDocument();
    // 11/12번째는 카드로 보이지 않고, 대신 "전체 보기" CTA만 노출된다.
    expect(screen.queryByText('오늘의 행사 10')).not.toBeInTheDocument();
    expect(screen.queryByText('오늘의 행사 11')).not.toBeInTheDocument();

    const link = screen.getByText('오늘 진행 중인 전체 행사 보기').closest('a');
    expect(link).toHaveAttribute('href', '/nearby?filter=TODAY_WEEKEND');
  });

  it('Hero Carousel 항목이 10개 이하면 "전체 보기" CTA 카드를 보여주지 않는다', () => {
    const heroEvents = Array.from({ length: 5 }, (_, i) =>
      makeEventItem({ id: `hero-${i}`, name: `오늘의 행사 ${i}` })
    );
    const feed: HomeFeed = { heroEvents, freeFeed: [] };
    render(<HomeView initialFeed={feed} />);

    expect(screen.queryByText('오늘 진행 중인 전체 행사 보기')).not.toBeInTheDocument();
  });

  // Task 9-1-11: "0원의 행복" → "가성비 행복" 서브탭 개편 검증
  describe('가성비 행복 서브탭 (Task 9-1-11)', () => {
    it('기본으로 "전체" 탭이 선택돼 있어 모든 항목을 보여준다', () => {
      const feed: HomeFeed = {
        heroEvents: [],
        freeFeed: [
          makeSpaceItem({ id: 'a', name: '무료 공원', is_free: true, is_kids_friendly: false }),
          makeSpaceItem({ id: 'b', name: '유료지만 무료피드에 있는 곳', is_free: false }),
        ],
      };
      render(<HomeView initialFeed={feed} />);

      expect(screen.getByText('무료 공원')).toBeInTheDocument();
      expect(screen.getByText('유료지만 무료피드에 있는 곳')).toBeInTheDocument();
    });

    it('"👶 키즈특화" 탭을 누르면 is_kids_friendly인 항목만 보여준다', () => {
      const feed: HomeFeed = {
        heroEvents: [],
        freeFeed: [
          makeSpaceItem({ id: 'kids', name: '키즈 전용 공간', is_kids_friendly: true }),
          makeSpaceItem({ id: 'general', name: '일반 공간', is_kids_friendly: false }),
        ],
      };
      render(<HomeView initialFeed={feed} />);

      fireEvent.click(screen.getByText('👶 키즈특화'));

      expect(screen.getByText('키즈 전용 공간')).toBeInTheDocument();
      expect(screen.queryByText('일반 공간')).not.toBeInTheDocument();
    });

    it('"🎁 완전무료" 탭을 누르면 is_free===true인 항목만 보여준다', () => {
      const feed: HomeFeed = {
        heroEvents: [],
        freeFeed: [
          makeSpaceItem({ id: 'free', name: '완전 무료 공간', is_free: true }),
          makeSpaceItem({ id: 'paid', name: '유료 공간', is_free: false }),
        ],
      };
      render(<HomeView initialFeed={feed} />);

      fireEvent.click(screen.getByText('🎁 완전무료'));

      expect(screen.getByText('완전 무료 공간')).toBeInTheDocument();
      expect(screen.queryByText('유료 공간')).not.toBeInTheDocument();
    });

    it('"⚡ 당일 바로입장" 탭을 누르면 SPACE는 항상 통과하고 EVENT는 오늘 기간에 포함될 때만 통과한다', () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const feed: HomeFeed = {
        heroEvents: [],
        freeFeed: [
          makeSpaceItem({ id: 'space', name: '상시 개방 공간' }),
          makeEventItem({ id: 'today-event', name: '오늘 진행 행사', start_date: todayStr, end_date: todayStr }),
          makeEventItem({ id: 'future-event', name: '다음 주 행사', start_date: '2099-01-01', end_date: '2099-01-02' }),
        ],
      };
      render(<HomeView initialFeed={feed} />);

      fireEvent.click(screen.getByText('⚡ 당일 바로입장'));

      expect(screen.getByText('상시 개방 공간')).toBeInTheDocument();
      expect(screen.getByText('오늘 진행 행사')).toBeInTheDocument();
      expect(screen.queryByText('다음 주 행사')).not.toBeInTheDocument();
    });
  });
});
