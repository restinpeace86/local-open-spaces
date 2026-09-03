import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMap } from './mini-map';

// [상세 모달 내 인앱 지도 및 위치 핀 표시 기능 구현](2026-08-30 사용자 지시) 요구사항 3:
// Kakao Maps SDK 로딩 상태에 따라 스켈레톤/실패 폴백(주소+복사 버튼)이 올바르게
// 전환되는지 검증한다. 실제 지도 렌더링 자체(kakao.maps.Map 생성 등)는 이 프로젝트에서
// 별도 단위 테스트 대상이 아니다(jsdom에서 외부 스크립트가 실제로 로드되지 않음, 기존
// detail-modal.test.tsx 관례와 동일) — loadKakaoMapSdk()를 모킹해 로딩/성공/실패 세
// 상태 전이만 검증한다.
const { loadKakaoMapSdk } = vi.hoisted(() => ({ loadKakaoMapSdk: vi.fn() }));
vi.mock('@/lib/kakao/load-kakao-sdk', () => ({ loadKakaoMapSdk }));

// [인앱 길찾기](2026-09-03) 실측으로 발견한 함정: vi.fn()에 화살표 함수를 구현체로 주면
// `new`로 호출했을 때 "is not a constructor"로 실제 런타임 에러가 난다(화살표 함수는
// 애초에 JS 스펙상 생성자로 쓸 수 없음, vi.fn이 `new.target`을 그대로 내부 구현체 호출에
// 반영하기 때문 — vitest 자체 경고 메시지도 이를 안내한다). 기존 Map/Marker 스텁도 이미
// 화살표 함수였는데, 그 두 스텁을 쓰던 기존 테스트들의 단언이 약해서(항상 렌더링되는
// role="img" div의 존재만 확인) 이 에러가 조용히 'error' 상태로 삼켜지고도 무증상으로
// 통과하고 있었다 — 이번에 Polyline 호출 여부처럼 더 엄격한 단언을 추가하면서 발견했다.
// 전부 `function` 표현식으로 바꿔 실제로 `new`가 가능하게 고친다.
function stubKakaoGlobal() {
  (window as unknown as { kakao: unknown }).kakao = {
    maps: {
      LatLng: vi.fn(function LatLng() {}),
      Map: vi.fn(function Map() {
        return { setDraggable: vi.fn(), setZoomable: vi.fn(), setBounds: vi.fn() };
      }),
      Marker: vi.fn(function Marker() {
        return { setMap: vi.fn() };
      }),
      Polyline: vi.fn(function Polyline() {
        return { setMap: vi.fn() };
      }),
      LatLngBounds: vi.fn(function LatLngBounds() {
        return { extend: vi.fn() };
      }),
      MarkerImage: vi.fn(function MarkerImage() {}),
      Size: vi.fn(function Size() {}),
    },
  };
}

describe('MiniMap', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (window as unknown as { kakao?: unknown }).kakao;
  });

  it('SDK 로드가 끝나기 전에는 로딩 스켈레톤을 보여준다', () => {
    loadKakaoMapSdk.mockReturnValue(new Promise(() => {})); // 영원히 대기(로딩 상태 고정)

    render(<MiniMap lat={37.5} lng={127.1} name="테스트 장소" />);

    expect(screen.getByLabelText('테스트 장소 위치 지도 불러오는 중')).toBeInTheDocument();
  });

  it('SDK 로드에 성공하면 스켈레톤이 사라지고 지도 컨테이너가 보인다', async () => {
    stubKakaoGlobal();
    loadKakaoMapSdk.mockResolvedValue(undefined);

    render(<MiniMap lat={37.5} lng={127.1} name="테스트 장소" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('테스트 장소 위치 지도 불러오는 중')).not.toBeInTheDocument();
    expect(screen.getByLabelText('테스트 장소 위치 지도')).toBeInTheDocument();
  });

  it('SDK 로드가 실패하고 address가 있으면 주소와 복사 버튼을 보여준다', async () => {
    loadKakaoMapSdk.mockRejectedValue(new Error('NEXT_PUBLIC_KAKAO_MAP_API_KEY가 설정되지 않았습니다.'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<MiniMap lat={37.5} lng={127.1} name="테스트 장소" address="경기도 성남시 분당구 어딘가" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('지도를 불러올 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('경기도 성남시 분당구 어딘가')).toBeInTheDocument();

    fireEvent.click(screen.getByText('주소 복사'));
    expect(writeText).toHaveBeenCalledWith('경기도 성남시 분당구 어딘가');
    expect(await screen.findByText('복사됨')).toBeInTheDocument();
  });

  it('SDK 로드가 실패하고 address가 없으면 복사 버튼을 보여주지 않는다', async () => {
    loadKakaoMapSdk.mockRejectedValue(new Error('네트워크 오류'));

    render(<MiniMap lat={37.5} lng={127.1} name="테스트 장소" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('지도를 불러올 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('주소 복사')).not.toBeInTheDocument();
  });

  // [인앱 길찾기](2026-09-03 사용자 지시): route가 주어지면 경로선(Polyline)과 출발지
  // 마커를 지도 위에 그리고, 출발지+경로 전체가 보이도록 뷰포트를 맞춘다.
  describe('route(길찾기 경로) 렌더링', () => {
    it('route가 있으면 Polyline과 출발지 마커를 그리고 뷰포트를 경로에 맞춘다', async () => {
      stubKakaoGlobal();
      loadKakaoMapSdk.mockResolvedValue(undefined);
      const kakaoMaps = (window as unknown as { kakao: { maps: Record<string, unknown> } }).kakao.maps;

      render(
        <MiniMap
          lat={37.5}
          lng={127.1}
          name="테스트 장소"
          route={{
            originLat: 37.4,
            originLng: 127.0,
            path: [
              { lat: 37.4, lng: 127.0 },
              { lat: 37.45, lng: 127.05 },
              { lat: 37.5, lng: 127.1 },
            ],
          }}
        />
      );

      await waitFor(() => expect(kakaoMaps.Polyline).toHaveBeenCalledTimes(1));
      // 출발지(1) + 목적지(1) = 총 2개의 마커가 생성된다.
      expect(kakaoMaps.Marker).toHaveBeenCalledTimes(2);
      expect(kakaoMaps.LatLngBounds).toHaveBeenCalledTimes(1);
    });

    it('route가 없으면(기본값) Polyline을 그리지 않는다', async () => {
      stubKakaoGlobal();
      loadKakaoMapSdk.mockResolvedValue(undefined);
      const kakaoMaps = (window as unknown as { kakao: { maps: Record<string, unknown> } }).kakao.maps;

      render(<MiniMap lat={37.5} lng={127.1} name="테스트 장소" />);
      await waitFor(() => expect(screen.getByLabelText('테스트 장소 위치 지도')).toBeInTheDocument());

      expect(kakaoMaps.Polyline).not.toHaveBeenCalled();
    });
  });
});
