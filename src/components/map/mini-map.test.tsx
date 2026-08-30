import { act, fireEvent, render, screen } from '@testing-library/react';
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

function stubKakaoGlobal() {
  (window as unknown as { kakao: unknown }).kakao = {
    maps: {
      LatLng: vi.fn(),
      Map: vi.fn(() => ({ setDraggable: vi.fn(), setZoomable: vi.fn() })),
      Marker: vi.fn(() => ({ setMap: vi.fn() })),
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
});
