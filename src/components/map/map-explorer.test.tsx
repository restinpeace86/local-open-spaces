import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapExplorer } from './map-explorer';

const rpcMock = vi.fn(() => Promise.resolve({ data: [], error: null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

// implementation/todo.md: 재검색 버튼 테스트는 dragend를 트리거하는 것이 목적이므로
// 실제 Kakao SDK 대신 onDragEnd를 즉시 호출할 수 있는 버튼을 노출하는 스텁으로 대체한다.
// Task 9-1-9: ?filter= 초기값 테스트를 위해 매 테스트가 바꿔 쓸 수 있는 가변 참조로 둔다.
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/map/kakao-map-view', () => ({
  KakaoMapView: ({ onDragEnd }: { onDragEnd?: (center: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onDragEnd?.({ lat: 37.5, lng: 127.1 })}>
      simulate-dragend
    </button>
  ),
}));

describe('MapExplorer 재검색 버튼', () => {
  it('지도 드래그(dragend) 후 재검색 버튼 클릭 시 새로운 중심 좌표로 RPC를 재조회한다', async () => {
    render(<MapExplorer />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenLastCalledWith('get_nearby_spaces_and_events', {
      user_lng: 126.978,
      user_lat: 37.5665,
      radius_meters: 5000,
    });

    expect(screen.queryAllByText('이 위치에서 재검색').length).toBe(0);

    fireEvent.click(screen.getByText('simulate-dragend'));

    const recenterButtons = await screen.findAllByText('이 위치에서 재검색');
    expect(recenterButtons.length).toBeGreaterThan(0);

    fireEvent.click(recenterButtons[0]);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenLastCalledWith('get_nearby_spaces_and_events', {
      user_lng: 127.1,
      user_lat: 37.5,
      radius_meters: 5000,
    });

    expect(screen.queryAllByText('이 위치에서 재검색').length).toBe(0);
  });
});

// Task 9-1-9: 홈 Hero Carousel "전체 보기" CTA(/nearby?filter=TODAY_WEEKEND)에서 넘어온
// Quick 필터를 초기 활성 상태로 반영하는지 검증.
describe('MapExplorer ?filter= 초기 Quick 필터 연동 (Task 9-1-9)', () => {
  afterEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  it('?filter=TODAY_WEEKEND로 진입하면 "오늘/주말" Quick 필터가 처음부터 활성화된다', () => {
    mockSearchParams = new URLSearchParams('filter=TODAY_WEEKEND');
    render(<MapExplorer />);

    const todayWeekendButtons = screen.getAllByText('⚡ 오늘/주말');
    expect(todayWeekendButtons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('알 수 없는 filter 값은 무시하고 아무 Quick 필터도 활성화하지 않는다', () => {
    mockSearchParams = new URLSearchParams('filter=NOT_A_REAL_FILTER');
    render(<MapExplorer />);

    const todayWeekendButtons = screen.getAllByText('⚡ 오늘/주말');
    expect(todayWeekendButtons[0]).toHaveAttribute('aria-pressed', 'false');
  });
});
