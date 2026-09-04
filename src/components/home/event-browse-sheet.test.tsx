import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBrowseSheet } from './event-browse-sheet';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시) 요구사항 3/4: 기존 3개 전체보기 페이지를
// 대체하는 바텀시트 검증 — 모드별 제목/지역 선택 노출 여부, 대분류 칩 클릭 시 즉시
// category_maj 파라미터로 재조회하는지, 페이지네이션 모드에서 "더 보기"가 이어붙이는지를
// 확인한다.
function makeEventItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'event-1',
    name: '테스트 행사',
    category: 'PERFORMANCE_FESTIVAL',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: '2026-08-29',
    end_date: '2026-08-29',
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
    booking_status: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EventBrowseSheet', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ items: [], total: 0 }) } as Response))
    );
  });

  it('mode에 따라 제목이 다르고, today 모드에서만 지역 선택 셀렉트를 보여준다', async () => {
    const { rerender } = render(
      <EventBrowseSheet mode="today" onClose={() => {}} onSelectItem={() => {}} />
    );
    expect(await screen.findByText('🎪 오늘 전체보기')).toBeInTheDocument();
    expect(screen.getByLabelText('지역')).toBeInTheDocument();

    rerender(<EventBrowseSheet mode="ongoing" onClose={() => {}} onSelectItem={() => {}} />);
    expect(await screen.findByText('지금 이 순간 함께하기 좋은 알찬 픽 전체보기')).toBeInTheDocument();
    expect(screen.queryByLabelText('지역')).not.toBeInTheDocument();
  });

  // [전체보기 바텀시트 칩 정리](2026-08-29 사용자 지시): 무의미한 "전체" 칩 제거.
  it('중분류 필터 칩 목록에 무의미한 "전체" 칩이 없다', async () => {
    render(<EventBrowseSheet mode="ongoing" onClose={() => {}} onSelectItem={() => {}} />);
    await screen.findByText('지금 이 순간 함께하기 좋은 알찬 픽 전체보기');

    expect(screen.queryByRole('button', { name: '전체' })).not.toBeInTheDocument();
    expect(screen.getByText('🎉 축제 / 이벤트')).toBeInTheDocument();
  });

  it('배경 클릭/닫기 버튼을 누르면 onClose를 호출한다', async () => {
    const onClose = vi.fn();
    render(<EventBrowseSheet mode="today" onClose={onClose} onSelectItem={() => {}} />);
    await screen.findByText('🎪 오늘 전체보기');

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('대분류 칩을 누르면 category_maj 파라미터로 즉시 재조회한다', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ json: () => Promise.resolve({ items: [], total: 0 }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<EventBrowseSheet mode="ongoing" onClose={() => {}} onSelectItem={() => {}} />);
    await screen.findByText('지금 이 순간 함께하기 좋은 알찬 픽 전체보기');

    fireEvent.click(screen.getByText('🎉 축제 / 이벤트'));

    await waitFor(() => {
      const lastUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(new URL(lastUrl, 'http://localhost').searchParams.get('category_maj')).toBe('축제 / 이벤트');
    });
  });

  it('같은 칩을 다시 누르면 필터를 해제하고 전체 조건으로 재조회한다', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ json: () => Promise.resolve({ items: [], total: 0 }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<EventBrowseSheet mode="ongoing" onClose={() => {}} onSelectItem={() => {}} />);
    await screen.findByText('지금 이 순간 함께하기 좋은 알찬 픽 전체보기');

    fireEvent.click(screen.getByText('🎉 축제 / 이벤트'));
    await waitFor(() => {
      const lastUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastUrl.includes('category_maj=')).toBe(true);
    });

    fireEvent.click(screen.getByText('🎉 축제 / 이벤트'));
    await waitFor(() => {
      const lastUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastUrl.includes('category_maj=')).toBe(false);
    });
  });

  // [개선사항3](2026-09-04 사용자 지시): "전체보기 바텀시트에도 페이지네이션/무한
  // 스크롤 도입" — "더 보기" 버튼을 스크롤 바닥 근접 감지로 교체했다
  // (MajorCategoryGrid 바텀시트와 동일한 패턴).
  it('paginated 모드에서 남은 항목이 있으면 스크롤이 바닥에 닿을 때 다음 페이지를 이어붙인다', async () => {
    const fetchMock = vi.fn((url: string) => {
      const page = new URL(url, 'http://localhost').searchParams.get('page');
      if (page === '2') {
        return Promise.resolve({
          json: () => Promise.resolve({ items: [makeEventItem({ id: 'e2', name: '두번째 행사' })], total: 2 }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({ items: [makeEventItem({ id: 'e1', name: '첫번째 행사' })], total: 2 }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<EventBrowseSheet mode="ongoing" onClose={() => {}} onSelectItem={() => {}} />);
    expect(await screen.findByText('첫번째 행사')).toBeInTheDocument();
    expect(screen.queryByText('더 보기')).not.toBeInTheDocument(); // 버튼은 더 이상 없다

    const scrollArea = container.querySelector('.overflow-y-auto')!;
    Object.defineProperty(scrollArea, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollArea, 'scrollTop', { value: 900, configurable: true });
    Object.defineProperty(scrollArea, 'clientHeight', { value: 100, configurable: true });
    fireEvent.scroll(scrollArea);

    expect(await screen.findByText('두번째 행사')).toBeInTheDocument();
    expect(screen.getByText('첫번째 행사')).toBeInTheDocument();
  });

  it('카드를 클릭하면 onSelectItem을 호출한다', async () => {
    const onSelectItem = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ items: [makeEventItem({ id: 'e1', name: '클릭용 행사' })], total: 1 }),
        } as Response)
      )
    );

    render(<EventBrowseSheet mode="today" onClose={() => {}} onSelectItem={onSelectItem} />);
    const card = await screen.findByText('클릭용 행사');
    fireEvent.click(card);

    expect(onSelectItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('결과가 없으면 빈 상태 안내를 보여준다', async () => {
    render(<EventBrowseSheet mode="today" onClose={() => {}} onSelectItem={() => {}} />);
    expect(await screen.findByText('🎪 오늘 전체보기')).toBeInTheDocument();
    expect(await screen.findByText('필터 초기화')).toBeInTheDocument();
  });
});
