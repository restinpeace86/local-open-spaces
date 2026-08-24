import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapExplorer } from './map-explorer';

const rpcMock = vi.fn(() => Promise.resolve({ data: [], error: null }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

// Task 9-6-10(2026-08-23): rpcMock이 모듈 스코프 공용이라 초기화 없이는 호출 횟수가 테스트
// 파일 전체에 걸쳐 누적된다 — 여러 테스트가 정확한 호출 횟수(toHaveBeenCalledTimes(1) 등)를
// 검증하므로 매 테스트 전에 초기화해 서로 영향을 주지 않게 한다.
beforeEach(() => {
  rpcMock.mockClear();
});

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
    // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서 p_item_type='SPACE'가
    // 항상 함께 넘어간다.
    expect(rpcMock).toHaveBeenLastCalledWith('get_nearby_spaces_and_events', {
      user_lng: 126.978,
      user_lat: 37.5665,
      radius_meters: 5000,
      p_item_type: 'SPACE',
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
      p_item_type: 'SPACE',
    });

    expect(screen.queryAllByText('이 위치에서 재검색').length).toBe(0);
  });
});

// Task 9-6-10(2026-08-23): 드래그+재검색으로 탐색 기준점이 바뀐 뒤, "내 위치/설정위치로
// 이동" 버튼을 누르면 원래 설정 위치로 되돌아가 그 위치 기준으로 재조회한다.
describe('MapExplorer 내 위치/설정위치로 이동 버튼 (Task 9-6-10)', () => {
  it('재검색으로 위치가 바뀐 뒤 버튼을 누르면 원래 설정 위치로 되돌아가 재조회한다', async () => {
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-dragend'));
    const recenterButtons = await screen.findAllByText('이 위치에서 재검색');
    fireEvent.click(recenterButtons[0]);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenLastCalledWith(
      'get_nearby_spaces_and_events',
      expect.objectContaining({ user_lng: 127.1, user_lat: 37.5 })
    );

    fireEvent.click(screen.getByLabelText('내 위치/설정위치로 이동'));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));
    expect(rpcMock).toHaveBeenLastCalledWith(
      'get_nearby_spaces_and_events',
      expect.objectContaining({ user_lng: 126.978, user_lat: 37.5665 })
    );
  });
});

// Task 9-6-10(2026-08-23): 상시 공간 전용 단일화 — RPC가 이미 SPACE만 반환하므로 이벤트
// on/off 토글(LayerToggle, "상시 시설 보기")은 더 이상 필요 없어 완전히 제거했다. 카테고리
// 칩도 5대 UI 카테고리(events와 공유하던 축)가 아니라 상시 공간 목적별 테마 라벨로 바뀐다.
describe('MapExplorer 상시 공간 전용 단일화 (Task 9-6-10)', () => {
  it('상시 시설 on/off 토글(LayerToggle)이 더 이상 렌더링되지 않는다', () => {
    render(<MapExplorer />);
    expect(screen.queryByText('상시 시설 보기')).not.toBeInTheDocument();
    expect(screen.queryByText('상시 시설 보임')).not.toBeInTheDocument();
  });

  it('카테고리 칩이 5대 UI 카테고리 대신 상시 공간 목적별 테마 라벨로 노출된다', () => {
    render(<MapExplorer />);
    expect(screen.getAllByText('공원·광장').length).toBeGreaterThan(0);
    expect(screen.getAllByText('어린이 놀이터').length).toBeGreaterThan(0);
    expect(screen.getAllByText('야외 수영장·물놀이터').length).toBeGreaterThan(0);
    expect(screen.getAllByText('국립공원·수목원·휴양림').length).toBeGreaterThan(0);
    expect(screen.getAllByText('박물관·미술관·체육시설').length).toBeGreaterThan(0);
    expect(screen.queryByText('체험·클래스')).not.toBeInTheDocument();
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
