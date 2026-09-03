import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { LocationOnboardingModal, withTimeout } from './location-onboarding-modal';

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
    // [동네 설정 개편](2026-09-04) "약 1초의 자연스러운 로딩 연출"이 추가돼 실제 응답이
    // 빨라도 최소 1초는 로딩 상태를 유지한다 — testing-library의 기본 findBy 타임아웃
    // (1000ms)과 정확히 겹쳐 flaky해지므로 이 모달의 목록 조회 관련 findBy는 여유 있게
    // 늘려서 기다린다.
    expect(await screen.findByText('서울특별시 강남구', {}, { timeout: 2000 })).toBeInTheDocument();
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

    expect(await screen.findByText('서울특별시', {}, { timeout: 2000 })).toBeInTheDocument();
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

    const option = await screen.findByText('서울특별시 강남구', {}, { timeout: 2000 });
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
    expect(await screen.findByText('서울특별시 강남구', {}, { timeout: 2000 })).toBeInTheDocument();
  });
});

// [동네 설정 개편](2026-09-04 사용자 지시): "3가지 명확한 선택지 제공: ① 평소 동네 근처,
// ② 현재 위치, ③ 다른 지역 바꾸기"와 "무한 로딩/에러 버그 해결"을 검증한다.
describe('LocationOnboardingModal (동네 설정 개편, 2026-09-04)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('①②③ 3가지 선택지 제목이 순서대로 노출된다', () => {
    vi.stubGlobal('navigator', {});
    render(<LocationOnboardingModal onConfirm={() => {}} onClose={() => {}} />);

    expect(screen.getByText('① 평소 동네 근처')).toBeInTheDocument();
    expect(screen.getByText('② 현재 위치')).toBeInTheDocument();
    expect(screen.getByText('③ 다른 지역 바꾸기')).toBeInTheDocument();
  });

  // [무한 로딩 버그의 핵심 로직] 컴포넌트를 렌더링해 fake timer로 검증하면 React
  // 스케줄러와 fake timer가 충돌해 상태 업데이트가 멈춘다 — withTimeout을 별도
  // export해 순수 함수로만 검증한다.
  it('withTimeout: 원본 프라미스가 응답 없이 멈추면(무한 대기) 지정한 시간 뒤 실패로 전환한다', async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise(() => {});

    const result = withTimeout(neverResolves, 8000);
    const assertion = expect(result).rejects.toThrow('시간이 너무 오래 걸립니다');

    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it('withTimeout: 지정한 시간 안에 응답하면 그 결과를 그대로 반환한다', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 8000)).resolves.toBe('ok');
  });

  it('시/군/구 목록 조회가 실패하면 에러와 재시도 버튼을 보여주고, 재시도하면 다시 조회해 성공할 수 있다', async () => {
    const { getSigunguOptions } = await import('@/lib/spaces/get-sigungu-options');
    vi.mocked(getSigunguOptions)
      .mockRejectedValueOnce(new Error('시/군/구 목록 조회 실패: network error'))
      .mockResolvedValueOnce([{ sigungu_name: '서울특별시 강남구', lng: 127.05, lat: 37.52 }]);
    vi.stubGlobal('navigator', {});

    render(<LocationOnboardingModal onConfirm={() => {}} onClose={() => {}} />);
    screen.getByText('🗺️ 시·군·구 목록에서 선택').click();

    const retryButton = await screen.findByText('다시 시도', {}, { timeout: 2000 });
    expect(screen.getByText('시/군/구 목록 조회 실패: network error')).toBeInTheDocument();

    retryButton.click();

    expect(await screen.findByText('서울특별시 강남구', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('다시 시도')).not.toBeInTheDocument();
  });
});
