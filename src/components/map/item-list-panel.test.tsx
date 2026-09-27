import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemListPanel } from './item-list-panel';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function makeItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '숲속 놀이터',
    category: 'OUTDOOR_NATURE',
    distance_meters: 1200,
    item_type: 'SPACE',
    lng: 127.1,
    lat: 37.4,
    address: '경기 성남시 분당구 판교로 68',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: null,
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

// [리스트 카드 UI 데이터 표기 스펙](2026-09-10 사용자 지시, todo.md 개선사항2-3):
// 상호명 / 거리 / 상세 주소 / 맞춤형 뱃지(없으면 숨김). 구형 레거시 라벨 미노출.
describe('ItemListPanel (스팟픽 리스트 카드)', () => {
  it('상호명·거리·상세 주소를 보여주고 구형 카테고리 라벨(야외·자연)은 보이지 않는다', () => {
    render(<ItemListPanel items={[makeItem()]} selectedId={null} onSelect={vi.fn()} />);

    expect(screen.getByText('숲속 놀이터')).toBeInTheDocument();
    expect(screen.getByText(/🧭\s*1\.2km/)).toBeInTheDocument();
    expect(screen.getByText('경기 성남시 분당구 판교로 68')).toBeInTheDocument();
    expect(screen.queryByText('야외·자연')).not.toBeInTheDocument();
  });

  it('맞춤형 뱃지가 있으면 "만 N세 이상" + 라벨 칩을 보여준다', () => {
    render(
      <ItemListPanel
        items={[makeItem()]}
        selectedId={null}
        onSelect={vi.fn()}
        badgesBySpotId={{ 'space-1': { labels: ['트램폴린/방방', '온수 샤워/온수 개수대'], minAge: 7 } }}
      />
    );

    expect(screen.getByText('만 7세 이상')).toBeInTheDocument();
    expect(screen.getByText('트램폴린/방방')).toBeInTheDocument();
    expect(screen.getByText('온수 샤워/온수 개수대')).toBeInTheDocument();
  });

  it('뱃지가 없으면 뱃지 영역을 렌더링하지 않는다', () => {
    const { container } = render(
      <ItemListPanel items={[makeItem()]} selectedId={null} onSelect={vi.fn()} badgesBySpotId={{}} />
    );
    // 칩 스타일(rounded-full)의 span이 없어야 한다.
    expect(container.querySelectorAll('span.rounded-full')).toHaveLength(0);
  });

  it('항목을 클릭하면 onSelect가 그 항목으로 호출된다(→ 상세 페이지 진입 경로)', () => {
    const onSelect = vi.fn();
    render(<ItemListPanel items={[makeItem()]} selectedId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('숲속 놀이터'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'space-1' }));
  });

  it('주소가 없으면 주소 줄을 렌더링하지 않는다', () => {
    render(<ItemListPanel items={[makeItem({ address: null })]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('숲속 놀이터')).toBeInTheDocument();
  });

  // [open_spaces 정기휴무 리스트 표시](2026-09-27 사용자 지시): "오늘 휴무인 항목은
  // 좀 연한 회색으로 리스트 색칠.. 사용자가 직관적으로 알수 있도록"
  describe('오늘 정기휴무인 스팟(2026-09-27)', () => {
    it('오늘 요일이 excluded_weekdays에 있으면 "오늘 휴무" 칩이 보이고 행이 회색으로 표시된다', () => {
      const today = new Date();
      const todayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][today.getDay()];
      render(
        <ItemListPanel
          items={[makeItem({ excluded_weekdays: [todayCode] })]}
          selectedId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.getByText('오늘 휴무')).toBeInTheDocument();
      expect(screen.getByText('숲속 놀이터')).toHaveClass('text-gray-400');
    });

    it('오늘 요일이 excluded_weekdays에 없으면 "오늘 휴무" 칩이 안 보인다', () => {
      const today = new Date();
      const todayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][today.getDay()];
      const otherCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].find((c) => c !== todayCode)!;
      render(
        <ItemListPanel
          items={[makeItem({ excluded_weekdays: [otherCode] })]}
          selectedId={null}
          onSelect={vi.fn()}
        />
      );

      expect(screen.queryByText('오늘 휴무')).not.toBeInTheDocument();
    });

    it('excluded_weekdays/excluded_nth_weekdays가 없으면(EVENT 등) "오늘 휴무" 칩이 안 보인다', () => {
      render(<ItemListPanel items={[makeItem()]} selectedId={null} onSelect={vi.fn()} />);
      expect(screen.queryByText('오늘 휴무')).not.toBeInTheDocument();
    });
  });
});
