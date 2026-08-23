import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TodayEventsPage from './page';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-6-6(2026-08-23): 홈 화면 "오늘 전체보기+"의 도착 화면 — 지도가 아니라 카드 그리드로
// 오늘 진행 중인 행사를 지역 계층(구/시 → 도, 타 지자체 완전 차단) 기준으로 모아 보여준다.
// 이 페이지는 /api/events/today를 호출할 뿐 지역 계층 필터링 로직 자체(타 지자체 차단)는
// get-home-feed.test.ts에서 이미 검증하므로, 여기서는 지역 스위처 UI와 화면 상태(로딩/빈
// 결과/카드 렌더링)만 검증한다.
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

function stubFetchEventsToday(itemsByRegion: Record<string, NearbyItem[]>) {
  const fetchMock = vi.fn((url: string) => {
    const regionMatch = /region=([^&]+)/.exec(url);
    const region = regionMatch ? regionMatch[1] : 'seongnam-bundang';
    return Promise.resolve({
      json: () => Promise.resolve({ items: itemsByRegion[region] ?? [] }),
    } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('TodayEventsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('진입 시 기본 지역(성남시 분당구) 기준으로 /api/events/today를 호출해 카드 그리드로 보여준다', async () => {
    stubFetchEventsToday({ 'seongnam-bundang': [makeEventItem({ id: 'e1', name: '분당 행사' })] });

    render(<TodayEventsPage />);

    expect(await screen.findByText('분당 행사')).toBeInTheDocument();
    expect(screen.getByText('🎪 오늘 전체보기')).toBeInTheDocument();
  });

  it('지역 스위처에서 다른 지역을 고르면 해당 지역 기준으로 다시 조회한다', async () => {
    const fetchMock = stubFetchEventsToday({
      'seongnam-bundang': [makeEventItem({ id: 'e1', name: '분당 행사' })],
      'seoul-seocho': [makeEventItem({ id: 'e2', name: '서초 행사' })],
    });

    render(<TodayEventsPage />);
    expect(await screen.findByText('분당 행사')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('지역'), { target: { value: 'seoul-seocho' } });

    expect(await screen.findByText('서초 행사')).toBeInTheDocument();
    expect(screen.queryByText('분당 행사')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('region=seoul-seocho'));
  });

  it('결과가 없으면 빈 상태 안내를 보여준다', async () => {
    stubFetchEventsToday({ 'seongnam-bundang': [] });

    render(<TodayEventsPage />);

    expect(await screen.findByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });
});
