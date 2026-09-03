import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapPreviewModal } from './map-preview-modal';

// [인앱 길찾기](2026-09-03 사용자 지시): "지도에서 보기가 확대/축소밖에 안 된다 — 현재
// 위치 기준 길찾기가 없다"는 지적으로 추가한 기능. 실제 지도 렌더링(MiniMap)은 별도
// 단위 테스트 대상이라(mini-map.test.tsx) 여기서는 MapPreviewModal이 위치 확인→경로
// 조회→MiniMap에 route 전달까지의 흐름만 검증하고, MiniMap 자체는 받은 route를 그대로
// 보여주는 가벼운 스텁으로 대체한다.
vi.mock('./mini-map', () => ({
  MiniMap: ({ route }: { route?: { originLat: number; originLng: number; path: unknown[] } | null }) => (
    <div data-testid="mini-map-stub">{route ? `route:${route.originLat},${route.originLng}` : 'no-route'}</div>
  ),
}));

function stubGeolocation(
  impl: (
    onSuccess: (position: { coords: { latitude: number; longitude: number } }) => void,
    onError: (error: unknown) => void
  ) => void
) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: vi.fn(impl) },
  });
}

describe('MapPreviewModal 인앱 길찾기 (2026-09-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as unknown as { geolocation?: unknown }).geolocation;
  });

  it('처음에는 "현재 위치에서 길찾기" 버튼만 보이고 MiniMap에는 route가 없다', () => {
    render(<MapPreviewModal lat={37.5} lng={127.1} name="테스트 스팟" onClose={() => {}} />);

    expect(screen.getByText('🧭 현재 위치에서 길찾기')).toBeInTheDocument();
    expect(screen.getByTestId('mini-map-stub')).toHaveTextContent('no-route');
  });

  it('위치 확인 → 경로 조회에 성공하면 거리/소요시간을 보여주고 MiniMap에 route를 전달한다', async () => {
    stubGeolocation((onSuccess) => onSuccess({ coords: { latitude: 37.4, longitude: 127.0 } }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              distanceMeters: 1991,
              durationSeconds: 467,
              path: [
                { lat: 37.4, lng: 127.0 },
                { lat: 37.5, lng: 127.1 },
              ],
            }),
        } as Response)
      )
    );

    render(<MapPreviewModal lat={37.5} lng={127.1} name="테스트 스팟" onClose={() => {}} />);
    fireEvent.click(screen.getByText('🧭 현재 위치에서 길찾기'));

    expect(await screen.findByText(/🚗 2\.0km · 약 8분/)).toBeInTheDocument();
    expect(screen.getByTestId('mini-map-stub')).toHaveTextContent('route:37.4,127');

    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/nearby/directions?');
    expect(calledUrl).toContain('origin_lat=37.4');
    expect(calledUrl).toContain('dest_lat=37.5');
  });

  it('위치 권한이 거부되면 에러 메시지를 보여준다', async () => {
    stubGeolocation((_onSuccess, onError) => onError(new Error('permission denied')));

    render(<MapPreviewModal lat={37.5} lng={127.1} name="테스트 스팟" onClose={() => {}} />);
    fireEvent.click(screen.getByText('🧭 현재 위치에서 길찾기'));

    expect(await screen.findByText('위치 권한이 거부되었거나 확인할 수 없습니다.')).toBeInTheDocument();
  });

  it('경로 조회 API가 실패하면 서버가 보낸 에러 메시지를 보여준다', async () => {
    stubGeolocation((onSuccess) => onSuccess({ coords: { latitude: 37.4, longitude: 127.0 } }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: '경로를 찾을 수 없습니다. 자동차로 이동 가능한 경로가 아닐 수 있어요.' }),
        } as Response)
      )
    );

    render(<MapPreviewModal lat={37.5} lng={127.1} name="테스트 스팟" onClose={() => {}} />);
    fireEvent.click(screen.getByText('🧭 현재 위치에서 길찾기'));

    expect(await screen.findByText('경로를 찾을 수 없습니다. 자동차로 이동 가능한 경로가 아닐 수 있어요.')).toBeInTheDocument();
  });

  it('이 브라우저가 위치 확인을 지원하지 않으면 안내 문구를 보여준다', async () => {
    delete (navigator as unknown as { geolocation?: unknown }).geolocation;

    render(<MapPreviewModal lat={37.5} lng={127.1} name="테스트 스팟" onClose={() => {}} />);
    fireEvent.click(screen.getByText('🧭 현재 위치에서 길찾기'));

    expect(await screen.findByText('이 브라우저에서는 위치 확인을 지원하지 않습니다.')).toBeInTheDocument();
  });
});
