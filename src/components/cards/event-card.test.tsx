import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventCard } from './event-card';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [카드 내 이미지/텍스트 영역 비율 불일치 수정] 재확인(2026-09-01, 실측으로 발견한 결함):
// getDateBannerBadge(event-status.ts)는 end_date 문자열을 UTC 자정으로 파싱한 뒤
// setHours(0,0,0,0)로 "로컬" 자정으로 재정규화하고, 현재 시각(new Date())도 동일하게
// 로컬 자정으로 정규화해 두 값을 비교한다 — 즉 "오늘"의 기준이 로컬 달력 날짜다.
// `new Date().toISOString().slice(0,10)`는 UTC 달력 날짜라, KST(UTC+9)처럼 로컬이
// UTC보다 앞선 시간대에서는 로컬 자정~로컬 오전 9시 사이(UTC로는 여전히 "어제")에
// 이 두 날짜가 실제로 어긋난다(실측 재현: 로컬 2026-09-01 07:52인데 UTC는 아직
// 2026-08-31이라 이 값으로 만든 end_date가 "오늘"로 인식되지 않아 배너가 안 뜸).
// 로컬 달력 날짜를 그대로 쓰는 헬퍼로 교체해 시간대/실행 시각과 무관하게 안정적으로
// 통과하게 한다.
function localTodayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeEventItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'event-1',
    name: '도시농업 체험',
    category: 'EXPERIENCE_CLASS',
    category_min: '도시농업',
    distance_meters: -1,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: '2026-08-27',
    end_date: '2026-08-27',
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: true,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: '초등',
    booking_status: null,
    ...overrides,
  };
}

// [카드 표준 중분류 표시](2026-08-27 사용자 지시)
describe('EventCard 표준 중분류 뱃지', () => {
  it('category_min이 있으면 event_type 라벨 대신 그 값을 뱃지로 보여준다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.queryByText('체험·클래스')).not.toBeInTheDocument();
  });

  it('category_min이 없으면 기존 event_type 라벨로 폴백한다', () => {
    render(<EventCard item={makeEventItem({ category_min: null })} onSelect={() => {}} />);

    expect(screen.getByText('체험·클래스')).toBeInTheDocument();
  });
});

// [카드 뱃지 문구 정리](2026-08-27 사용자 지시)
describe('EventCard 뱃지 문구', () => {
  it('무료 뱃지는 "완전 무료"가 아니라 "무료"로 표시된다', () => {
    render(<EventCard item={makeEventItem({ is_free: true })} onSelect={() => {}} />);

    expect(screen.getByText('🎁 무료')).toBeInTheDocument();
    expect(screen.queryByText('🎁 완전 무료')).not.toBeInTheDocument();
  });
});

// [이벤트 카드 텍스트 영역 뱃지 정리](2026-09-04 사용자 지시): "키즈/어린이" 같은 거슬리는
// 뱃지는 텍스트 영역에 아예 노출되지 않아야 한다 — parental-badges.ts에서 이벤트 카드용
// 'kids' 뱃지 생성 자체를 없앴다(hideBadgeKeys로 개별 화면에서만 숨기던 예전 방식과 달리
// 전역으로 제거). is_kids_friendly/target_age_group 값과 무관하게 항상 노출되지 않아야 한다.
describe('EventCard 키즈/어린이 뱃지 제거 (2026-09-04)', () => {
  it('is_kids_friendly=true여도 키즈/어린이 뱃지를 텍스트 영역에 보여주지 않는다', () => {
    render(<EventCard item={makeEventItem({ is_kids_friendly: true, target_age_group: '초등' })} onSelect={() => {}} />);

    expect(screen.queryByText('👶 키즈/어린이')).not.toBeInTheDocument();
  });

  it('target_age_group이 영유아여도 유아전용 뱃지를 보여주지 않는다', () => {
    render(<EventCard item={makeEventItem({ is_kids_friendly: false, target_age_group: '영유아' })} onSelect={() => {}} />);

    expect(screen.queryByText('👶 유아전용')).not.toBeInTheDocument();
  });
});

// [EventCard 이미지:텍스트 포션 고정](2026-08-29 사용자 지시, 2026-09-03 비율 5:5로
// 조정): 카드 고정 높이 안에서 이미지/텍스트 영역이 flex-[5]/flex-[5]로 정확히
// 나뉘는지 검증한다(사용자 확인: 중분류 태그·상태 라벨·마감임박 배너는 이미지 위
// 오버레이로 그대로 유지).
describe('EventCard 이미지:텍스트 5:5 포션 (2026-09-03)', () => {
  it('이미지 영역과 텍스트 영역이 flex-[5]/flex-[5]로 동일하게 고정된다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    const title = screen.getByText('도시농업 체험');
    const textArea = title.parentElement!;
    const imageArea = textArea.previousElementSibling!;

    expect(imageArea).toHaveClass('flex-[5]');
    expect(textArea).toHaveClass('flex-[5]');
  });

  // [카드 내 이미지/텍스트 영역 비율 불일치 진짜 원인](2026-08-30 사용자 재확인): 이미지
  // 영역에 min-h-0이 없으면, flex 아이템 기본값(min-height:auto)이 <img>의
  // min-content 크기(원본 이미지 가로세로 비율을 폭에 대입한 높이)를 존중해 버려 썸네일마다
  // 이미지 영역 실제 렌더링 높이가 제각각이 된다(jsdom은 실제 레이아웃을 계산하지 않아 이
  // 버그 자체를 유닛 테스트로 재현할 수는 없다 — Playwright로 실제 브라우저 렌더링 높이를
  // 실측해 8장 전부 92px:162px로 고정됨을 확인했다, 구현 기록 참고 — 4:6이던 당시 실측값이며
  // 5:5로 바뀐 지금은 비율만 다를 뿐 원리는 동일하다). 이 테스트는 최소한 그 수정에 필요한
  // min-h-0 클래스가 유지되는지만 회귀 방지한다.
  it('이미지 영역에 min-h-0이 있어 원본 이미지 비율과 무관하게 flex-[5] 높이가 강제된다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    const title = screen.getByText('도시농업 체험');
    const imageArea = title.parentElement!.previousElementSibling!;

    expect(imageArea).toHaveClass('min-h-0');
  });

  it('이미지는 object-cover로 꽉 채워 찌그러짐을 방지한다', () => {
    const { container } = render(
      <EventCard item={makeEventItem({ thumbnail_url: 'https://example.com/thumb.jpg' })} onSelect={() => {}} />
    );

    const img = container.querySelector('img');
    expect(img).toHaveClass('w-full', 'h-full', 'object-cover');
  });

  it('제목은 line-clamp-2로 줄 수가 제한된다', () => {
    render(<EventCard item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('도시농업 체험')).toHaveClass('line-clamp-2');
  });
});

// [카드 높이/뱃지 정리](2026-09-03 사용자 지시): "카드 세로 높이가 길고 뱃지가 중구난방" —
// 예약 마감 경고와 status 오버레이가 같은 정보를 중복 표시하던 것을 제거하고, 예약 안내
// 뱃지는 DetailModal에만 남기고, 무료/유료·실내/야외는 이미지 오버레이로 옮겨 텍스트
// 영역의 줄 수(=카드 높이)를 줄였다.
describe('EventCard 카드 높이/뱃지 정리 (2026-09-03)', () => {
  it('예약 마감 임박이어도 텍스트 영역에 중복 경고 뱃지("🚨 오늘 예약 마감")를 더 이상 보여주지 않는다', () => {
    render(
      <EventCard
        item={makeEventItem({ is_reservation_required: true, reservation_end_date: localTodayStr() })}
        onSelect={() => {}}
      />
    );
    // 이미지 오버레이(status.label)로는 여전히 "오늘 마감"이 보인다 — 정보 자체가
    // 사라진 게 아니라 중복 표시만 없앴다.
    expect(screen.getByText('오늘 마감')).toBeInTheDocument();
    expect(screen.queryByText('🚨 오늘 예약 마감')).not.toBeInTheDocument();
  });

  it('예약 안내 뱃지("사전예약필요"/"예약불필요")는 더 이상 카드에 노출하지 않는다(DetailModal로 이동)', () => {
    const required = render(
      <EventCard item={makeEventItem({ is_reservation_required: true, reservation_url: null })} onSelect={() => {}} />
    );
    expect(screen.queryByText(/사전예약필요/)).not.toBeInTheDocument();
    required.unmount();

    render(<EventCard item={makeEventItem({ is_reservation_required: false, reservation_url: null })} onSelect={() => {}} />);
    expect(screen.queryByText(/예약불필요/)).not.toBeInTheDocument();
  });

  it('무료/유료 뱃지는 텍스트 영역이 아니라 이미지 영역 안에 렌더링된다', () => {
    render(<EventCard item={makeEventItem({ is_free: true })} onSelect={() => {}} />);

    const priceBadge = screen.getByText('🎁 무료');
    const title = screen.getByText('도시농업 체험');
    const imageArea = title.parentElement!.previousElementSibling!;
    expect(imageArea).toContainElement(priceBadge);
  });

  it('실내/야외 뱃지는 텍스트 영역이 아니라 이미지 영역 안에 렌더링된다', () => {
    render(<EventCard item={makeEventItem({ facility_type: '실내' })} onSelect={() => {}} />);

    const facilityBadge = screen.getByText('실내');
    const title = screen.getByText('도시농업 체험');
    const imageArea = title.parentElement!.previousElementSibling!;
    expect(imageArea).toContainElement(facilityBadge);
  });

  // [이벤트 카드 텍스트 영역 뱃지 정리](2026-09-04 사용자 지시): 키즈/어린이 뱃지도
  // parental-badges.ts에서 제거해, 텍스트 영역에는 이제 접수 상태(booking_status) 뱃지
  // 하나만 남는다.
  it('텍스트 영역에는 접수 상태 뱃지만 남고, 키즈 대상 뱃지는 더 이상 없다', () => {
    render(<EventCard item={makeEventItem({ booking_status: '오늘방문', is_kids_friendly: true })} onSelect={() => {}} />);

    const title = screen.getByText('도시농업 체험');
    const textArea = title.parentElement!;
    expect(textArea).toContainElement(screen.getByText('⚡ 오늘 당일 입장 가능'));
    expect(screen.queryByText('👶 키즈/어린이')).not.toBeInTheDocument();
  });
});

// [카드 내 이미지/텍스트 영역 비율 불일치 수정](2026-08-30 사용자 지시): 오늘 마감/오늘
// 한정 dateBanner가 이미지/텍스트 사이의 별도 flex 행으로 존재하면, 배너가 있는 카드는
// "전체 높이 - 배너 높이"만 비율대로 나누고 배너 없는 카드는 전체 높이를 그 비율로 나눠
// 같은 크기 래퍼 안에서도 카드마다 이미지/텍스트 크기가 달라졌다 — 배너를 이미지 영역
// 위 절대 위치 오버레이로 옮겨 배너 유무와 무관하게 항상 동일한 분할(2026-09-03부터
// 5:5)을 보장한다.
describe('EventCard dateBanner가 있어도 이미지:텍스트 비율이 항상 동일하다 (2026-08-30)', () => {
  it('오늘 마감/오늘 한정 배너는 별도 flex 행이 아니라 이미지 영역 위 오버레이로 렌더링된다', () => {
    const today = localTodayStr();
    const { container } = render(
      <EventCard item={makeEventItem({ start_date: today, end_date: today })} onSelect={() => {}} />
    );

    const button = container.querySelector('button')!;
    // 버튼의 최상위 자식은 이미지 영역(flex-[5])/텍스트 영역(flex-[5]) 단 둘뿐이어야 한다 —
    // 배너가 셋째 자식(별도 flex 행)으로 끼어들면 분할 비율이 배너 유무에 따라 달라진다.
    expect(button.children.length).toBe(2);
    expect(button.children[0]).toHaveClass('flex-[5]');
    expect(button.children[1]).toHaveClass('flex-[5]');

    const banner = screen.getByText('⚡ 오늘 한정');
    expect(button.children[0]).toContainElement(banner);
  });

  it('배너가 있는 카드와 없는 카드 모두 이미지 영역이 동일하게 flex-[5]이다', () => {
    const today = localTodayStr();
    const withoutBanner = render(<EventCard item={makeEventItem()} onSelect={() => {}} />);
    const imageAreaWithout = withoutBanner.container.querySelector('button')!.children[0];

    withoutBanner.unmount();

    const withBanner = render(
      <EventCard item={makeEventItem({ start_date: today, end_date: today })} onSelect={() => {}} />
    );
    const imageAreaWith = withBanner.container.querySelector('button')!.children[0];

    expect(imageAreaWithout.className).toBe(imageAreaWith.className);
  });
});
