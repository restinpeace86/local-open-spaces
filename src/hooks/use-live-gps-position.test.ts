import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiveGpsPosition } from './use-live-gps-position';

describe('useLiveGpsPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('geolocation 조회가 성공하면 좌표를 반환한다', async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.38, longitude: 127.12 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useLiveGpsPosition());

    await waitFor(() => expect(result.current).toEqual({ lat: 37.38, lng: 127.12 }));
  });

  it('권한이 거부되어도 에러 없이 null을 유지한다', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useLiveGpsPosition());

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('geolocation을 지원하지 않는 환경에서도 에러 없이 null을 유지한다', () => {
    vi.stubGlobal('navigator', {});

    const { result } = renderHook(() => useLiveGpsPosition());

    expect(result.current).toBeNull();
  });
});
