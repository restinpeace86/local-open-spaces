import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGpsSyncCheck } from './use-gps-sync-check';

// [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3)
vi.mock('@/lib/kakao/geocode', () => ({
  reverseGeocodeAddress: vi.fn(),
}));

const CONFIGURED_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청

describe('useGpsSyncCheck', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('설정된 동네와 GPS 위치가 2km 이상 차이 나면 역지오코딩 후 제안(suggestion)을 채운다', async () => {
    const { reverseGeocodeAddress } = await import('@/lib/kakao/geocode');
    // 성남시 분당구 방향(서울시청에서 약 20km 이상 떨어진 좌표)
    vi.mocked(reverseGeocodeAddress).mockResolvedValue('경기도 성남시 분당구 정자동');
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.38, longitude: 127.12 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useGpsSyncCheck(CONFIGURED_CENTER, false));

    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(result.current.suggestion).toEqual({
      lat: 37.38,
      lng: 127.12,
      address_name: '경기도 성남시 분당구 정자동',
      sigungu_name: '성남시 분당구',
    });
  });

  it('설정된 동네와 GPS 위치 차이가 미미하면(2km 미만) 제안하지 않는다', async () => {
    const { reverseGeocodeAddress } = await import('@/lib/kakao/geocode');
    const getCurrentPosition = vi.fn((success) =>
      // 서울시청에서 약 500m 정도 떨어진 좌표
      success({ coords: { latitude: 37.57, longitude: 126.978 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useGpsSyncCheck(CONFIGURED_CENTER, false));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(result.current.suggestion).toBeNull();
    expect(reverseGeocodeAddress).not.toHaveBeenCalled();
  });

  it('온보딩이 열려 있으면(동네 미설정) GPS 위치를 가져와도 제안하지 않는다', async () => {
    const { reverseGeocodeAddress } = await import('@/lib/kakao/geocode');
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.38, longitude: 127.12 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useGpsSyncCheck(CONFIGURED_CENTER, true));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(result.current.suggestion).toBeNull();
    expect(reverseGeocodeAddress).not.toHaveBeenCalled();
  });

  it('GPS 권한이 거부되어도 에러를 던지지 않고 조용히 제안 없음 상태를 유지한다', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useGpsSyncCheck(CONFIGURED_CENTER, false));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    expect(result.current.suggestion).toBeNull();
  });

  it('dismiss() 호출 시 제안이 사라지고 다시 확인하지 않는다(같은 렌더 생명주기 동안)', async () => {
    const { reverseGeocodeAddress } = await import('@/lib/kakao/geocode');
    vi.mocked(reverseGeocodeAddress).mockResolvedValue('경기도 성남시 분당구 정자동');
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 37.38, longitude: 127.12 } })
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const { result } = renderHook(() => useGpsSyncCheck(CONFIGURED_CENTER, false));
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());

    act(() => result.current.dismiss());
    expect(result.current.suggestion).toBeNull();
    // 검사 자체는 mount 시 한 번만 수행되므로(hasChecked), dismiss 이후 재요청되지 않는다.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
