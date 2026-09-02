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
  it('"🗺️ 지도에서 보기" 버튼을 누르면 외부로 나가지 않고 인앱 지도 모달이 열린다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    const button = screen.getByText('🗺️ 지도에서 보기');
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

  it('is_free=false이지만 affiliate_url이 없으면 "🎟️ 할인 예매하기" 대신 "🗺️ 지도에서 보기"로 폴백한다', () => {
    render(
      <DetailModal
        item={makeSpaceItem({ is_free: false, reservation_url: null, info_url: null, affiliate_url: null })}
        onClose={() => {}}
      />
    );

    expect(screen.queryByText('🎟️ 할인 예매하기')).not.toBeInTheDocument();
    expect(screen.getByText('🗺️ 지도에서 보기')).toBeInTheDocument();
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
    expect(screen.queryByText('🗺️ 지도에서 보기')).not.toBeInTheDocument();
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
    expect(screen.queryByText(/메뉴/)).not.toBeInTheDocument();
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

  it('hideMapSection이 없으면(기존 화면들) 미니맵과 "지도에서 보기" CTA가 그대로 보인다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} />);

    expect(screen.getByText('🗺️ 지도에서 보기')).toBeInTheDocument();
  });

  it('hideMapSection이 true이고 정확한 좌표인 스팟은 미니맵도 "지도에서 보기" CTA도 렌더링하지 않는다', () => {
    render(<DetailModal item={makeSpaceItem()} onClose={() => {}} hideMapSection />);

    expect(screen.queryByText('🗺️ 지도에서 보기')).not.toBeInTheDocument();
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

    expect(screen.getByText('🗺️ 지도에서 보기')).toBeInTheDocument();
  });
});
