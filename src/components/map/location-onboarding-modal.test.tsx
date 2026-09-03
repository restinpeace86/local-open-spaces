import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { LocationOnboardingModal } from './location-onboarding-modal';

vi.mock('@/lib/kakao/geocode', () => ({
  reverseGeocodeAddress: vi.fn(),
  searchPlaceKeyword: vi.fn(),
}));

vi.mock('@/lib/spaces/get-sigungu-options', () => ({
  getSigunguOptions: vi.fn(),
}));

// Task 9-1-8: GPS 2단계 Fallback — 실패/권한 거부 시 에러 토스트와 동시에 시/군/구
// 수동 선택 시트가 자동으로 열리는지 검증한다.
describe('LocationOnboardingModal (Task 9-1-8: GPS 2단계 Fallback)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GPS 권한이 거부되면 에러 메시지와 동시에 수동 시/군/구 선택 시트가 자동으로 열린다', async () => {
    const { getSigunguOptions } = await import('@/lib/spaces/get-sigungu-options');
    vi.mocked(getSigunguOptions).mockResolvedValue([
      { sigungu_name: '서울특별시 강남구', lng: 127.05, lat: 37.52 },
      { sigungu_name: '경기도 성남시 분당구', lng: 127.12, lat: 37.38 },
    ]);

    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const onConfirm = vi.fn();
    render(<LocationOnboardingModal onConfirm={onConfirm} onClose={() => {}} />);

    screen.getByText('📍 현재 위치로 찾기').click();

    expect(await screen.findByText('위치 권한이 거부되었거나 확인할 수 없습니다.')).toBeInTheDocument();
    expect(await screen.findByText('서울특별시 강남구')).toBeInTheDocument();
    expect(screen.getByText('경기도 성남시 분당구')).toBeInTheDocument();
  });

  // [todo.md 개선사항 2-3](2026-09-03): 368건에 달하는 시/군/구 목록을 시/도 단위로
  // 묶어 소제목을 붙였는지 검증한다.
  it('시/군/구 목록을 시/도(첫 단어) 기준으로 그룹핑해 소제목을 붙인다', async () => {
    const { getSigunguOptions } = await import('@/lib/spaces/get-sigungu-options');
    vi.mocked(getSigunguOptions).mockResolvedValue([
      { sigungu_name: '서울특별시 강남구', lng: 127.05, lat: 37.52 },
      { sigungu_name: '서울특별시 마포구', lng: 126.95, lat: 37.56 },
      { sigungu_name: '경기도 성남시', lng: 127.12, lat: 37.44 },
    ]);

    vi.stubGlobal('navigator', {});
    render(<LocationOnboardingModal onConfirm={() => {}} onClose={() => {}} />);
    screen.getByText('📍 현재 위치로 찾기').click();

    expect(await screen.findByText('서울특별시')).toBeInTheDocument();
    expect(screen.getByText('경기도')).toBeInTheDocument();
    expect(screen.getByText('서울특별시 강남구')).toBeInTheDocument();
    expect(screen.getByText('서울특별시 마포구')).toBeInTheDocument();
    expect(screen.getByText('경기도 성남시')).toBeInTheDocument();
  });

  it('수동 선택 시트에서 지역을 고르면 해당 지역의 대표 좌표로 확정한다', async () => {
    const { getSigunguOptions } = await import('@/lib/spaces/get-sigungu-options');
    vi.mocked(getSigunguOptions).mockResolvedValue([
      { sigungu_name: '서울특별시 강남구', lng: 127.05, lat: 37.52 },
    ]);

    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const onConfirm = vi.fn();
    render(<LocationOnboardingModal onConfirm={onConfirm} onClose={() => {}} />);

    screen.getByText('📍 현재 위치로 찾기').click();

    const option = await screen.findByText('서울특별시 강남구');
    option.click();

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({
        lat: 37.52,
        lng: 127.05,
        address_name: '서울특별시 강남구',
        sigungu_name: '서울특별시 강남구',
      })
    );
  });

  it('이 브라우저에서 위치 확인을 지원하지 않으면 즉시 수동 선택 시트를 연다', async () => {
    const { getSigunguOptions } = await import('@/lib/spaces/get-sigungu-options');
    vi.mocked(getSigunguOptions).mockResolvedValue([
      { sigungu_name: '서울특별시 강남구', lng: 127.05, lat: 37.52 },
    ]);

    vi.stubGlobal('navigator', {});

    render(<LocationOnboardingModal onConfirm={() => {}} onClose={() => {}} />);

    screen.getByText('📍 현재 위치로 찾기').click();

    expect(await screen.findByText('이 브라우저에서는 위치 확인을 지원하지 않습니다.')).toBeInTheDocument();
    expect(await screen.findByText('서울특별시 강남구')).toBeInTheDocument();
  });
});
