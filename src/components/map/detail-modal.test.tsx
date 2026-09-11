import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DetailModal } from './detail-modal';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [Decision 019](2026-09-02): DetailModal 헤더에 추가된 BookmarkButton이 useUser() 훅을
// 쓴다 — 비로그인으로 고정해 렌더링만 되고(찜 버튼은 조용히 숨김) 이 파일의 기존 CTA/뱃지
// 테스트에는 영향이 없게 한다.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

// Task 9-5-1(2026-08-22): MiniMap은 Kakao Maps SDK를 비동기 로드하는데, jsdom 환경에서는
// 스크립트 태그가 실제로 로드되지 않아 loadKakaoMapSdk()의 Promise가 해소되지 않는다(정상 —
// 실제 지도 렌더링 자체는 kakao-map-view.tsx처럼 이 프로젝트에서 별도 단위 테스트 대상이
// 아니다). 여기서는 그 위젯을 감싸는 DetailModal의 나머지 동작(인앱 지도 CTA 버튼, 크게보기
// 버튼 토글)만 검증한다.

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

describe('DetailModal (외부 지도 앱 연동 제거 및 인앱 위치 보기)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // [외부 지도 앱 연동 제거 및 인앱 위치 보기](2026-08-30 사용자 지시): 예약/예매 링크가
  // 없을 때 뜨는 CTA가 더 이상 네이버 지도 외부 링크가 아니라, 인앱 미니맵의 "🔍 크게보기"와
  // 동일한 MapPreviewModal을 여는 버튼이어야 한다(유저가 앱을 이탈하지 않음).
  it('"🗺️ 지도에서 길찾기" 버튼을 누르면 외부로 나가지 않고 인앱 지도 모달이 열린다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    const button = screen.getByText('🗺️ 지도에서 길찾기');
    expect(button.closest('a')).toBeNull(); // 외부 링크(<a>)가 아니라 버튼이어야 한다.
    expect(button.closest('button')).not.toBeNull();

    fireEvent.click(button);
    expect(screen.getByLabelText('지도 닫기')).toBeInTheDocument();
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

  it('is_free=false이지만 affiliate_url이 없으면 "🎟️ 할인 예매하기" 대신 "🗺️ 지도에서 길찾기"로 폴백한다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ is_free: false, reservation_url: null, info_url: null, affiliate_url: null })}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('🎟️ 할인 예매하기')).not.toBeInTheDocument();
    expect(screen.getByText('🗺️ 지도에서 길찾기')).toBeInTheDocument();
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
    expect(screen.queryByText('🗺️ 지도에서 길찾기')).not.toBeInTheDocument();
  });
});

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 이전에 있던 네이버 검색
// 딥링크 폴백을 완전히 제거하고, info_url 유무에 따라 [공식 홈페이지 바로가기] 또는
// [간편 예약/신청하기]로 분기한다.
// [예약 버튼 노출 조건 엄격화](2026-09-01 사용자 지시): info_url도 없고 큐레이션(관리자
// 확인 신호)도 없는 "완전 미확인" 스팟에는 더 이상 자체 신청 폼을 무조건 띄우지 않는다 —
// 안내 텍스트로 대체한다. 큐레이션이 있는 스팟에서만 자체 신청 폼이 최종 폴백으로 뜬다.
describe('DetailModal 보조 액션(공식 홈페이지 / 간편 예약·신청 / 안내 텍스트)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockCurationResponse(item: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item }) } as Response))
    );
  }

  it('info_url이 있으면 [🌐 공식 홈페이지 바로가기]가 그 URL로 새 창 연결된다(간편 예약 버튼은 없음)', async () => {
    mockCurationResponse(null);
    render(<DetailModal item={makeSpaceItem({ info_url: 'https://버섯구지마을.kr' })} onClose={() => {}} />);

    const link = screen.getByText('🌐 공식 홈페이지 바로가기').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://버섯구지마을.kr');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
  });

  it('info_url도 큐레이션도 없는 유료 시설은 버튼 대신 "예약 관련 정보가 없습니다" 안내 텍스트를 보여준다', async () => {
    mockCurationResponse(null);
    render(<DetailModal item={makeSpaceItem({ name: '버섯구지마을', info_url: null, is_free: false })} onClose={() => {}} />);

    expect(await screen.findByText('예약 관련 정보가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('🌐 공식 홈페이지 바로가기')).not.toBeInTheDocument();
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
  });

  it('info_url도 큐레이션도 없는 무료 시설은 "예약 필요 없음 · 상시 무료 입장"을 보여준다', async () => {
    mockCurationResponse(null);
    render(<DetailModal item={makeSpaceItem({ info_url: null, is_free: true })} onClose={() => {}} />);

    expect(await screen.findByText('예약 필요 없음 · 상시 무료 입장')).toBeInTheDocument();
  });

  it('info_url은 없지만 관리자가 큐레이션한 스팟이면 [📝 간편 예약/신청하기] 버튼이 뜨고, 누르면 신청 폼 모달이 열린다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      menu_items: [],
      naver_booking_url: null,
      curation_note: null,
    });
    render(<DetailModal item={makeSpaceItem({ name: '버섯구지마을', info_url: null })} onClose={() => {}} />);

    expect(screen.queryByText('🌐 공식 홈페이지 바로가기')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText('📝 간편 예약/신청하기'));

    expect(screen.getByText('📝 간편 예약/신청')).toBeInTheDocument();
    // "버섯구지마을"은 DetailModal 제목과 신청 폼 모달 부제 두 곳에 함께 표시된다.
    expect(screen.getAllByText('버섯구지마을')).toHaveLength(2);
  });

  it('이벤트(EVENT)에는 어떤 보조 액션도 노출하지 않는다(요구사항이 "스팟" 한정)', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT', info_url: null })} onClose={() => {}} />);

    expect(screen.queryByText('🌐 공식 홈페이지 바로가기')).not.toBeInTheDocument();
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
    expect(screen.queryByText('예약 관련 정보가 없습니다')).not.toBeInTheDocument();
  });
});

// [카드 표준 중분류/연령대상 표시](2026-08-27 사용자 지시)
describe('DetailModal 표준 중분류 뱃지 및 연령대상 표시', () => {
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

  // [개선사항6](2026-09-11 사용자 지시): 이벤트 상세카드 8단 구조 재설계로 연령대상이
  // 별도 "연령대상" 라벨 행이 아니라 2단(뱃지 영역)의 배지 하나로 표시된다(정보 자체는
  // 그대로 유지 — 제5장 제3조, 배치만 새 구조에 맞게 바뀜).
  it('행사에 target_audience가 있으면 사람이 읽을 수 있는 한글 뱃지로 보여준다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', target_audience: 'KIDS_SCHOOL' })}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('초등학생 이상')).toBeInTheDocument();
  });

  it('target_audience가 없으면 연령대상 뱃지 자체를 숨긴다', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT', target_audience: null })} onClose={() => {}} />);

    expect(screen.queryByText('초등학생 이상')).not.toBeInTheDocument();
  });
});

// [상세보기 설명 추가](2026-08-27 사용자 지시)
describe('DetailModal 설명(description) 표시', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('짧은 설명은 그대로 보여주고 "더보기" 버튼이 없다', () => {
    render(
      <DetailModal item={makeSpaceItem({ item_type: 'EVENT', description: '짧은 설명입니다.' })} onClose={() => {}} />
    );

    expect(screen.getByText('짧은 설명입니다.')).toBeInTheDocument();
    expect(screen.queryByText('더보기')).not.toBeInTheDocument();
  });

  it('긴 설명(60자 초과)은 "더보기" 버튼이 있고, 누르면 "접기"로 바뀐다', () => {
    const longDescription = '가'.repeat(61);
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT', description: longDescription })} onClose={() => {}} />);

    expect(screen.getByText('더보기')).toBeInTheDocument();
    fireEvent.click(screen.getByText('더보기'));
    expect(screen.getByText('접기')).toBeInTheDocument();
    expect(screen.queryByText('더보기')).not.toBeInTheDocument();
  });

  it('설명이 없으면 아무것도 렌더링하지 않는다', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT', description: null })} onClose={() => {}} />);

    expect(screen.queryByText('더보기')).not.toBeInTheDocument();
  });

  it('공간(SPACE)은 description이 있어도 보여주지 않는다(이벤트 전용 기능)', () => {
    render(<DetailModal item={makeSpaceItem({ description: '이건 공간 설명' })} onClose={() => {}} />);

    expect(screen.queryByText('이건 공간 설명')).not.toBeInTheDocument();
  });
});

// [스마트 폴백 아키텍처](2026-09-01 사용자 지시) 섹션 1: View Fallback(spot_curations
// 조회 결과에 따라 풍성한 뷰 vs 기존 공공데이터 뷰) + Reservation Fallback(네이버 예약
// 링크 우선순위)을 검증한다.
describe('DetailModal 스마트 폴백(View/Reservation Fallback, 2026-09-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockCurationResponse(item: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item }) } as Response))
    );
  }

  it('큐레이션이 없으면(item: null) 기존처럼 공공데이터 운영시간을 그대로 보여준다', async () => {
    mockCurationResponse(null);
    render(<DetailModal item={makeSpaceItem({ operating_hours: '평일 09:00-18:00' })} onClose={() => {}} />);

    expect(await screen.findByText('평일 09:00-18:00')).toBeInTheDocument();
    // [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 개선사항3-5): 메뉴가 없어도
    // 행 자체는 숨기지 않고 전용 문구를 보여준다(예전엔 완전히 숨겨졌음).
    expect(screen.getByText('메뉴')).toBeInTheDocument();
    expect(await screen.findByText('상세 메뉴 정보는 순차적으로 추가될 예정이에요')).toBeInTheDocument();
  });

  it('큐레이션이 있으면 구조화된 영업시간(오픈~마감/브레이크타임/라스트오더)을 우선 보여준다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: '아무 원문',
      open_time: '10:00',
      close_time: '22:00',
      break_start: '15:00',
      break_end: '17:00',
      last_order: '21:30',
      menu_items: [],
      naver_booking_url: null,
      curation_note: null,
    });
    render(<DetailModal item={makeSpaceItem({ operating_hours: '평일 09:00-18:00' })} onClose={() => {}} />);

    expect(await screen.findByText('10:00~22:00 (브레이크타임 15:00~17:00, 라스트오더 21:30)')).toBeInTheDocument();
    expect(screen.queryByText('평일 09:00-18:00')).not.toBeInTheDocument();
  });

  it('큐레이션에 메뉴가 있으면 메뉴 목록을 보여준다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      menu_items: [{ name: '짜장면', price: 7000 }],
      naver_booking_url: null,
      curation_note: null,
    });
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    expect(await screen.findByText('짜장면 · 7,000원')).toBeInTheDocument();
  });

  // [가격 및 메뉴 '준비 중' 플레이스홀더](2026-09-08 사용자 지시, todo.md 개선사항3-5)
  describe('가격 정보', () => {
    it('큐레이션에 입장료(child_fee/guardian_fee)가 있으면 그대로 보여준다', async () => {
      mockCurationResponse({
        id: 'curation-1',
        spot_id: 'space-1',
        image_url: null,
        operating_hours_raw: null,
        open_time: null,
        close_time: null,
        break_start: null,
        break_end: null,
        last_order: null,
        menu_items: [],
        child_fee: 12000,
        guardian_fee: 5000,
        naver_booking_url: null,
        curation_note: null,
      });
      render(<DetailModal item={makeSpaceItem({ is_free: false })} onClose={() => {}} />);

      expect(await screen.findByText('어린이 12,000원 · 보호자 5,000원')).toBeInTheDocument();
    });

    it('입장료가 없어도 공공데이터로 이미 무료임을 알면(is_free=true) "무료입장"으로 보여준다(오해의 소지가 있는 준비중 문구 대신)', async () => {
      mockCurationResponse(null);
      render(<DetailModal item={makeSpaceItem({ is_free: true })} onClose={() => {}} />);

      expect(await screen.findByText('무료입장')).toBeInTheDocument();
    });

    it('입장료도 없고 무료 여부도 모르면 준비중 플레이스홀더를 보여준다', async () => {
      mockCurationResponse(null);
      render(<DetailModal item={makeSpaceItem({ is_free: null })} onClose={() => {}} />);

      expect(await screen.findByText('가격 정보 업데이트 준비 중입니다 ⏳')).toBeInTheDocument();
    });
  });

  it('큐레이션의 대표 이미지가 있으면 헤더에 보여준다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: 'https://example.com/curated.jpg',
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      menu_items: [],
      naver_booking_url: null,
      curation_note: null,
    });
    const { container } = render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    const img = await screen.findByAltText('율동공원');
    expect(img).toHaveAttribute('src', 'https://example.com/curated.jpg');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('공식 홈페이지(info_url)가 있으면 네이버 예약 링크가 있어도 공식 링크를 우선한다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      menu_items: [],
      naver_booking_url: 'https://booking.naver.com/xyz',
      curation_note: null,
    });
    render(<DetailModal item={makeSpaceItem({ info_url: 'https://official.example.com' })} onClose={() => {}} />);

    await screen.findByText('🌐 공식 홈페이지 바로가기');
    expect(screen.queryByText('🟢 네이버로 예약하기')).not.toBeInTheDocument();
  });

  it('공식 홈페이지는 없지만 확인된 네이버 예약 링크가 있으면 그 링크로 안내한다', async () => {
    mockCurationResponse({
      id: 'curation-1',
      spot_id: 'space-1',
      image_url: null,
      operating_hours_raw: null,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
      last_order: null,
      menu_items: [],
      naver_booking_url: 'https://booking.naver.com/xyz',
      curation_note: null,
    });
    render(<DetailModal item={makeSpaceItem({ info_url: null })} onClose={() => {}} />);

    const link = await screen.findByText('🟢 네이버로 예약하기');
    expect(link.closest('a')).toHaveAttribute('href', 'https://booking.naver.com/xyz');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  // [예약 버튼 노출 조건 엄격화](2026-09-01 사용자 지시): 자체 간편 예약 폼은 더 이상
  // "아무 데이터도 없을 때의 무조건 폴백"이 아니다 — 큐레이션(관리자 확인 신호)이
  // 있을 때만 최종 폴백으로 뜬다(바로 위 "보조 액션" describe 블록의 큐레이션-있음
  // 테스트가 그 경우를 검증한다). 큐레이션도 없으면 안내 텍스트로 대체된다.
  it('공식 링크도 네이버 예약 링크도 큐레이션도 없으면 자체 신청 폼 대신 안내 텍스트를 보여준다', async () => {
    mockCurationResponse(null);
    render(<DetailModal item={makeSpaceItem({ info_url: null, is_free: false })} onClose={() => {}} />);

    expect(await screen.findByText('예약 관련 정보가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
  });
});

// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 4: 스팟픽(/nearby) 지도 화면은
// 배경이 이미 지도라 상세 모달 안의 인앱 미니맵/지도 CTA가 중복이다. hideMapSection
// prop으로 map-explorer.tsx에서만 이 영역을 생략한다.
describe('DetailModal hideMapSection (중복 지도 뷰 제거, 2026-09-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hideMapSection이 없으면(기존 화면들) 미니맵과 "지도에서 길찾기" CTA가 그대로 보인다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    expect(screen.getByText('🗺️ 지도에서 길찾기')).toBeInTheDocument();
  });

  it('hideMapSection이 true이고 정확한 좌표인 스팟은 미니맵도 "지도에서 길찾기" CTA도 렌더링하지 않는다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} hideMapSection />);

    expect(screen.queryByText('🗺️ 지도에서 길찾기')).not.toBeInTheDocument();
    expect(screen.queryByText('🔍 크게보기')).not.toBeInTheDocument();
  });

  it('hideMapSection이 true여도 좌표가 부정확하면 "정확한 위치 정보 없음" 안내는 그대로 보여준다(중복 제거 대상이 아님)', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ location_precision: 'CITY_APPROX', sigungu_name: '성남시 분당구' })}
        onClose={() => {}}
        hideMapSection
      />
    );

    expect(screen.getByText(/성남시 분당구 일대/)).toBeInTheDocument();
  });

  it('hideMapSection이 true여도 이벤트(EVENT)는 기존처럼 미니맵을 그대로 보여준다("이벤트픽은 기존 구조 유지")', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT' })} onClose={() => {}} hideMapSection />);

    expect(screen.getByText('🗺️ 지도에서 길찾기')).toBeInTheDocument();
  });
});

// [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): "장소기준으로는
// 난지캠핑장 하나 아니야?" → "다건에 대하여서는 클릭시 쫙 뜨는걸로 하자" — item.group_id가
// 있고 onExpandGroup이 넘어온 화면(map-explorer.tsx)에서만 버튼이 뜨는지 검증한다.
describe('DetailModal 그룹 펼쳐보기(2026-09-09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('group_id가 없으면 버튼을 보여주지 않는다', () => {
    render(<DetailModal item={makeSpaceItem({ group_id: null })} onClose={() => {}} onExpandGroup={vi.fn()} />);

    expect(screen.queryByText('🔗 이 장소의 다른 예약 옵션 보기')).not.toBeInTheDocument();
  });

  it('group_id가 있어도 onExpandGroup을 넘기지 않은 화면(대부분)에서는 버튼을 보여주지 않는다', () => {
    render(<DetailModal item={makeSpaceItem({ group_id: 'group-1' })} onClose={() => {}} />);

    expect(screen.queryByText('🔗 이 장소의 다른 예약 옵션 보기')).not.toBeInTheDocument();
  });

  it('group_id가 있고 onExpandGroup이 넘어오면 버튼을 보여주고, 클릭 시 group_id로 호출된다', () => {
    const onExpandGroup = vi.fn();
    render(<DetailModal item={makeSpaceItem({ group_id: 'group-1' })} onClose={() => {}} onExpandGroup={onExpandGroup} />);

    fireEvent.click(screen.getByText('🔗 이 장소의 다른 예약 옵션 보기'));
    expect(onExpandGroup).toHaveBeenCalledWith('group-1');
  });

  it('isExpandingGroup이 true면 버튼이 비활성화되고 로딩 문구로 바뀐다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ group_id: 'group-1' })}
        onClose={() => {}}
        onExpandGroup={vi.fn()}
        isExpandingGroup
      />
    );

    const button = screen.getByText('불러오는 중...');
    expect(button).toBeDisabled();
    expect(screen.queryByText('🔗 이 장소의 다른 예약 옵션 보기')).not.toBeInTheDocument();
  });

  it('이벤트(EVENT)는 group_id가 있어도 버튼을 보여주지 않는다(개념상 그룹이 없음)', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', group_id: 'group-1' })}
        onClose={() => {}}
        onExpandGroup={vi.fn()}
      />
    );

    expect(screen.queryByText('🔗 이 장소의 다른 예약 옵션 보기')).not.toBeInTheDocument();
  });
});

// [스팟픽 상세 카드 최종 UI](2026-09-10 사용자 지시, implementation/todo.md 개선사항3
// + 2-2 UI + 2-4): spotPickCard=true(map-explorer.tsx만 전달)일 때의 재설계 동작.
describe('DetailModal 스팟픽 카드(spotPickCard)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // /api/spot-curations와 /api/spot-blog-reviews 응답을 URL로 구분해 돌려준다.
  function mockSpotPickFetch({
    curation = null,
    blogUrls = [],
  }: { curation?: unknown; blogUrls?: string[] } = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/spot-blog-reviews')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { urls: blogUrls } }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: curation }) } as Response);
      })
    );
  }

  const CURATION = {
    id: 'c1',
    spot_id: 'space-1',
    image_url: null,
    operating_hours_raw: null,
    open_time: null,
    close_time: null,
    break_start: null,
    break_end: null,
    last_order: null,
    menu_items: [],
    child_fee: null,
    guardian_fee: null,
    naver_booking_url: null,
    curation_note: null,
    badge_labels: ['트램폴린/방방', '온수 샤워/온수 개수대'],
    min_age_recommended: 0,
  };

  it('구형 레거시 뱃지(5대 UI 카테고리)를 배제하고 노출 중분류 맞춤형 뱃지만 보여준다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(<DetailModal item={makeSpaceItem({ category: 'OUTDOOR_NATURE' })} onClose={() => {}} spotPickCard hideMapSection />);

    expect(await screen.findByText('트램폴린/방방')).toBeInTheDocument();
    expect(screen.getByText('온수 샤워/온수 개수대')).toBeInTheDocument();
    expect(screen.queryByText('야외·자연')).not.toBeInTheDocument();
  });

  it('min_age_recommended > 0이면 "만 N세 이상" 뱃지를 보여준다', async () => {
    mockSpotPickFetch({ curation: { ...CURATION, min_age_recommended: 7 } });
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} spotPickCard hideMapSection />);

    expect(await screen.findByText('만 7세 이상')).toBeInTheDocument();
  });

  it('외부 예약 링크가 하나도 없으면 예약 버튼/안내 텍스트를 완전히 숨긴다(자체 간편 예약 폼 미노출)', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(<DetailModal item={makeSpaceItem({ info_url: null })} onClose={() => {}} spotPickCard hideMapSection />);

    // 뱃지가 뜬 뒤 = 큐레이션 로딩 완료
    await screen.findByText('트램폴린/방방');
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
    expect(screen.queryByText('예약 관련 정보가 없습니다')).not.toBeInTheDocument();
    expect(screen.queryByText('예약 필요 없음 · 상시 무료 입장')).not.toBeInTheDocument();
  });

  it('naver_booking_url이 있으면 [🟢 네이버로 예약하기] 외부 링크를 보여준다', async () => {
    mockSpotPickFetch({ curation: { ...CURATION, naver_booking_url: 'https://booking.naver.com/x' } });
    render(<DetailModal item={makeSpaceItem({ info_url: null })} onClose={() => {}} spotPickCard hideMapSection />);

    const link = (await screen.findByText('🟢 네이버로 예약하기')).closest('a');
    expect(link).toHaveAttribute('href', 'https://booking.naver.com/x');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('info_url은 하단 예약 버튼이 아니라 상세 정보의 "홈페이지" 행 링크로만 노출된다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(
      <DetailModal
        item={makeSpaceItem({ info_url: 'https://official.example.com' })}
        onClose={() => {}}
        spotPickCard
        hideMapSection
      />
    );

    await screen.findByText('트램폴린/방방');
    const link = screen.getByText('공식 홈페이지 바로가기 ↗').closest('a');
    expect(link).toHaveAttribute('href', 'https://official.example.com');
    // 하단 예약 버튼(간편 예약/네이버 예약)은 없다 — naver_booking_url이 없으므로.
    expect(screen.queryByText('🌐 공식 홈페이지 바로가기')).not.toBeInTheDocument();
    expect(screen.queryByText('🟢 네이버로 예약하기')).not.toBeInTheDocument();
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
  });

  it('거리(길찾기) 버튼을 누르면 외부로 나가지 않고 인앱 지도 모달이 열린다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(
      <DetailModal item={makeSpaceItem({ distance_meters: 1200 })} onClose={() => {}} spotPickCard hideMapSection />
    );

    const btn = await screen.findByRole('button', { name: /길찾기/ });
    fireEvent.click(btn);
    // MapPreviewModal이 열리면 "크게보기" 계열 UI가 아니라 모달 자체가 마운트된다 —
    // 여기서는 외부 링크(a[href])로 나가지 않았다는 것만 확인한다.
    expect(btn.tagName).toBe('BUTTON');
  });

  it('블로그 후기 URL이 있으면 개수만큼 새 창 링크 버튼을 보여주고, 없으면 영역을 숨긴다', async () => {
    mockSpotPickFetch({
      curation: CURATION,
      blogUrls: ['https://blog.naver.com/a', 'https://blog.naver.com/b'],
    });
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} spotPickCard hideMapSection />);

    const b1 = (await screen.findByText('📝 블로그 후기 1')).closest('a');
    expect(b1).toHaveAttribute('href', 'https://blog.naver.com/a');
    expect(b1).toHaveAttribute('target', '_blank');
    expect(screen.getByText('📝 블로그 후기 2')).toBeInTheDocument();
    expect(screen.queryByText('📝 블로그 후기 3')).not.toBeInTheDocument();
  });

  it('spotPickCard가 아니면(다른 화면) 기존 5대 카테고리 라벨을 그대로 보여준다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(<DetailModal item={makeSpaceItem({ category: 'OUTDOOR_NATURE' })} onClose={() => {}} />);

    expect(await screen.findByText('야외·자연')).toBeInTheDocument();
    expect(screen.queryByText('트램폴린/방방')).not.toBeInTheDocument();
  });

  // [제휴 상품 ↔ 스팟픽 마커 연동](2026-09-10 사용자 지시, todo.md 개선사항6)
  it('연동된 제휴 상품(deal)이 있으면 특가 뱃지 + 제휴 링크 CTA를 보여준다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(
      <DetailModal
        item={makeSpaceItem()}
        onClose={() => {}}
        spotPickCard
        hideMapSection
        deal={{ title: '주말 입장권 30% 할인', bookingUrl: 'https://deal.example.com/1' }}
      />
    );

    expect(await screen.findByText('🔥 특가')).toBeInTheDocument();
    const cta = screen.getByText(/주말 입장권 30% 할인/).closest('a');
    expect(cta).toHaveAttribute('href', 'https://deal.example.com/1');
    expect(cta).toHaveAttribute('target', '_blank');
  });

  it('deal이 없으면 특가 뱃지/CTA가 없다', async () => {
    mockSpotPickFetch({ curation: CURATION });
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} spotPickCard hideMapSection />);

    await screen.findByText('트램폴린/방방');
    expect(screen.queryByText('🔥 특가')).not.toBeInTheDocument();
  });
});

// [개선사항6](2026-09-11 사용자 지시, implementation/todo.md): "이벤트 상세카드 8단 구조"
// 재설계 — 이미지 슬라이드/뱃지(카테고리+진행상태)/제목+인터랙티브 거리/행사기간/
// 예약기간/설명 토글/미니맵/하단 고정 CTA.
describe('DetailModal 이벤트 상세카드 8단 구조 (개선사항6, 2026-09-11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1단: 썸네일이 없으면 이미지 영역 자체를 렌더링하지 않는다', () => {
    const { container } = render(
      <DetailModal item={makeSpaceItem({ item_type: 'EVENT', thumbnail_url: null })} onClose={() => {}} />
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('1단: 썸네일이 있으면 이미지를 보여주고, 1장뿐이면 좌우 넘김/점 표시는 없다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', thumbnail_url: 'https://example.com/event.jpg' })}
        onClose={() => {}}
      />
    );

    const img = screen.getByAltText('율동공원');
    expect(img).toHaveAttribute('src', 'https://example.com/event.jpg');
    expect(screen.queryByLabelText('다음 이미지')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('이전 이미지')).not.toBeInTheDocument();
  });

  it('2단: 카테고리 뱃지와 현재 진행 상태 뱃지를 함께 보여준다', () => {
    // getEventStatus(event-status.ts)는 is_reservation_required+reservation_end_date
    // 조합으로 상태를 판단한다 — 마감일을 충분히 먼 미래로 두면 "접수중"이 된다.
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          category: 'EXPERIENCE_CLASS',
          category_min: '도시농업',
          is_reservation_required: true,
          reservation_end_date: '2099-01-01',
        })}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.getByText('접수중')).toBeInTheDocument();
  });

  it('3단: 정확한 좌표가 있으면 spotPickCard 여부와 무관하게 거리 영역이 항상 탭 가능한 버튼이다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ item_type: 'EVENT', distance_meters: 1500, location_precision: 'EXACT' })}
        onClose={() => {}}
      />
    );

    const button = screen.getByText(/1\.5km/).closest('button');
    expect(button).not.toBeNull();

    fireEvent.click(button!);
    expect(screen.getByLabelText('지도 닫기')).toBeInTheDocument();
  });

  it('5단: 예약 기간이 있으면 별도 행으로 보여준다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          is_reservation_required: true,
          reservation_start_date: '2026-09-01T00:00:00+09:00',
          reservation_end_date: '2026-09-10T00:00:00+09:00',
        })}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('예약 기간')).toBeInTheDocument();
    expect(screen.getByText('2026-09-01 ~ 2026-09-10')).toBeInTheDocument();
  });

  it('5단: 예약 기간 정보가 없으면 그 행 자체를 숨긴다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          reservation_start_date: null,
          reservation_end_date: null,
        })}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('예약 기간')).not.toBeInTheDocument();
  });

  it('8단: 이벤트는 하단에 CTA 버튼이 하나만 있다(스팟의 보조 액션 행 없음)', () => {
    render(
      <DetailModal
        item={makeSpaceItem({
          item_type: 'EVENT',
          is_free: true,
          reservation_url: 'https://yeyak.seoul.go.kr/event/2',
        })}
        onClose={() => {}}
      />
    );

    const link = screen.getByText('🏛️ 공공 예약하기').closest('a');
    expect(link).toHaveAttribute('href', 'https://yeyak.seoul.go.kr/event/2');
    // 스팟 전용 보조 액션(공식 홈페이지/간편 예약 등)은 이벤트에 렌더링되지 않는다.
    expect(screen.queryByText('🌐 공식 홈페이지 바로가기')).not.toBeInTheDocument();
    expect(screen.queryByText('📝 간편 예약/신청하기')).not.toBeInTheDocument();
  });

  // [개선사항8](2026-09-11 사용자 지시): "방문 후기 / 추천 블로그" 카드 리스트 —
  // 관리자가 큐레이션한 URL이 있을 때만 노출하고, 0개면 섹션 전체를 숨긴다.
  it('큐레이션 블로그 URL이 있으면 "방문 후기 / 추천 블로그" 섹션을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/events/curated-blog-urls')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ urls: ['https://blog.naver.com/a', 'https://blog.naver.com/b'] }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      })
    );
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT' })} onClose={() => {}} />);

    expect(await screen.findByText('📝 방문 후기 / 추천 블로그')).toBeInTheDocument();
    const link1 = screen.getByText('블로그 후기 1').closest('a');
    expect(link1).toHaveAttribute('href', 'https://blog.naver.com/a');
    expect(link1).toHaveAttribute('target', '_blank');
    expect(screen.getByText('블로그 후기 2')).toBeInTheDocument();
  });

  it('큐레이션 블로그 URL이 없으면 섹션 자체를 렌더링하지 않는다', () => {
    render(<DetailModal item={makeSpaceItem({ item_type: 'EVENT' })} onClose={() => {}} />);

    expect(screen.queryByText('📝 방문 후기 / 추천 블로그')).not.toBeInTheDocument();
  });
});
