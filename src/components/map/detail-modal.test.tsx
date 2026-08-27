import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailModal } from './detail-modal';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// Task 9-5-1(2026-08-22): MiniMap은 Kakao Maps SDK를 비동기 로드하는데, jsdom 환경에서는
// 스크립트 태그가 실제로 로드되지 않아 loadKakaoMapSdk()의 Promise가 해소되지 않는다(정상 —
// 실제 지도 렌더링 자체는 kakao-map-view.tsx처럼 이 프로젝트에서 별도 단위 테스트 대상이
// 아니다). 여기서는 그 위젯을 감싸는 DetailModal의 나머지 동작(네이버 길안내 링크, 크게보기
// 버튼 토글)만 검증한다.
let mockUserLocation = { lat: 37.4, lng: 127.2 };
vi.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ center: mockUserLocation }),
}));

function makeSpaceItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '율동공원',
    category: 'OUTDOOR_NATURE',
    distance_meters: -1,
    item_type: 'SPACE',
    lng: 127.12,
    lat: 37.38,
    address: '경기도 성남시 분당구 어딘가',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
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

describe('DetailModal (Task 9-5-1: 네이버 지도 길안내 출발지 자동 매핑 + 미니맵)', () => {
  beforeEach(() => {
    mockUserLocation = { lat: 37.4, lng: 127.2 };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('"🗺️ 길찾기" 링크에 유저의 전역 위치가 출발지(slat/slng)로 자동 채워진다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    const link = screen.getByText('🗺️ 길찾기').closest('a');
    expect(link).not.toBeNull();
    const href = link!.getAttribute('href')!;

    expect(href).toContain('nmap://route/car?');
    expect(href).toContain('slat=37.4');
    expect(href).toContain('slng=127.2');
    expect(href).toContain('dlat=37.38');
    expect(href).toContain('dlng=127.12');
  });

  it('"🔍 크게보기" 버튼을 누르면 풀스크린 지도 모달이 열리고, 닫기 버튼으로 닫힌다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    expect(screen.queryByLabelText('지도 닫기')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('🔍 크게보기'));
    expect(screen.getByLabelText('지도 닫기')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('지도 닫기'));
    expect(screen.queryByLabelText('지도 닫기')).not.toBeInTheDocument();
  });
});

describe('DetailModal 조건부 CTA 3분류 (Task 9-6-11, Decision 011)', () => {
  beforeEach(() => {
    mockUserLocation = { lat: 37.4, lng: 127.2 };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('행사에 reservation_url이 있으면 "🏛️ 공공 예약하기"가 그 URL로 연결된다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          is_free: true,
          reservation_url: 'https://yeyak.seoul.go.kr/event/1',
        })}
        onClose={() => {}}
      />
    );

    const link = screen.getByText('🏛️ 공공 예약하기').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://yeyak.seoul.go.kr/event/1');
  });

  it('공간이 is_free=true이지만 reservation_url이 없으면 info_url을 "🏛️ 공공 예약하기" 링크로 대신 쓴다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ is_free: true, reservation_url: null, info_url: 'https://park.example.com' })}
        onClose={() => {}}
      />
    );

    const link = screen.getByText('🏛️ 공공 예약하기').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://park.example.com');
  });

  it('is_free=false이고 affiliate_url이 있으면 "🎟️ 할인 예매하기"가 그 URL로 연결된다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          is_free: false,
          reservation_url: null,
          info_url: null,
          affiliate_url: 'https://link.coupang.com/a/example',
        })}
        onClose={() => {}}
      />
    );

    const link = screen.getByText('🎟️ 할인 예매하기').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://link.coupang.com/a/example');
  });

  it('is_free=false이지만 affiliate_url이 없으면 "🎟️ 할인 예매하기" 대신 "🗺️ 길찾기"로 폴백한다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ is_free: false, reservation_url: null, info_url: null, affiliate_url: null })}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('🎟️ 할인 예매하기')).not.toBeInTheDocument();
    expect(screen.getByText('🗺️ 길찾기')).toBeInTheDocument();
  });

  it('예약/예매 URL이 전혀 없고 정확한 좌표도 없으면(CITY_APPROX) CTA 버튼이 아예 렌더링되지 않는다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          is_free: false,
          reservation_url: null,
          info_url: null,
          affiliate_url: null,
          location_precision: 'CITY_APPROX',
        })}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('🏛️ 공공 예약하기')).not.toBeInTheDocument();
    expect(screen.queryByText('🎟️ 할인 예매하기')).not.toBeInTheDocument();
    expect(screen.queryByText('🗺️ 길찾기')).not.toBeInTheDocument();
  });
});

// [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시)
describe('DetailModal 표준 중분류 뱃지 및 연령대상 표시', () => {
  beforeEach(() => {
    mockUserLocation = { lat: 37.4, lng: 127.2 };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('행사는 event_type 기반 라벨 대신 category_min을 뱃지로 보여준다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', category: 'EXPERIENCE_CLASS', category_min: '도시농업' })}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.queryByText('체험·클래스')).not.toBeInTheDocument();
  });

  it('공간은 category_min이 있어도 기존 5대 카테고리 라벨을 그대로 보여준다(이벤트 전용 변경)', () => {
    render(<DetailModal item={makeSpaceItem({ category: 'OUTDOOR_NATURE' })} onClose={() => {}} />);

    expect(screen.getByText('야외·자연')).toBeInTheDocument();
  });

  it('행사에 target_audience가 있으면 "연령대상" 행을 사람이 읽을 수 있는 한글로 보여준다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', target_audience: 'KIDS_SCHOOL' })}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('연령대상')).toBeInTheDocument();
    expect(screen.getByText('초등학생 이상')).toBeInTheDocument();
  });

  it('target_audience가 없으면 "연령대상" 행 자체를 숨긴다', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT', target_audience: null })} onClose={() => {}} />);

    expect(screen.queryByText('연령대상')).not.toBeInTheDocument();
  });
});
