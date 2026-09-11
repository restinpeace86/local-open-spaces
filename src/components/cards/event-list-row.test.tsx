import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventListRow } from './event-list-row';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [개선사항3](2026-09-11 사용자 지시, implementation/todo.md): "전체보기" 바텀시트용
// 이미지 없는 1열 리스트 행 — 4단 라인 구조(제목+거리 / 뱃지 / 행사·운영기간 / 예약기간)를
// 검증한다. 이미지 렌더링 자체를 제거하는 게 목적이라 img 태그가 전혀 없어야 한다.
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
    start_date: '2026-09-01',
    end_date: '2026-09-10',
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
    target_age_group: null,
    booking_status: null,
    ...overrides,
  };
}

describe('EventListRow', () => {
  it('제목과 뱃지, 행사기간을 보여주고 이미지는 렌더링하지 않는다', () => {
    render(<EventListRow item={makeEventItem()} onSelect={() => {}} />);

    expect(screen.getByText('도시농업 체험')).toBeInTheDocument();
    expect(screen.getByText('도시농업')).toBeInTheDocument(); // category_min 뱃지
    expect(screen.getByText('🎁 무료')).toBeInTheDocument();
    expect(screen.getByText('🗓 2026-09-01 ~ 2026-09-10')).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('distance_meters가 -1(위치 미상)이면 거리를 숨긴다', () => {
    render(<EventListRow item={makeEventItem({ distance_meters: -1 })} onSelect={() => {}} />);
    expect(screen.queryByText(/km|m$/)).not.toBeInTheDocument();
  });

  it('distance_meters가 유효하면 거리를 보여준다', () => {
    render(<EventListRow item={makeEventItem({ distance_meters: 1500 })} onSelect={() => {}} />);
    expect(screen.getByText('1.5km')).toBeInTheDocument();
  });

  it('시작/종료일이 둘 다 없으면(open_spaces 상시 운영 항목) "상시"를 보여준다', () => {
    render(
      <EventListRow
        item={makeEventItem({ item_type: 'SPACE', start_date: null, end_date: null })}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('🗓 상시')).toBeInTheDocument();
  });

  it('예약기간이 있으면 네 번째 줄에 보여준다', () => {
    render(
      <EventListRow
        item={makeEventItem({
          reservation_start_date: '2026-08-20T00:00:00+09:00',
          reservation_end_date: '2026-08-25T00:00:00+09:00',
        })}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('📌 예약 2026-08-20 ~ 2026-08-25')).toBeInTheDocument();
  });

  it('예약기간 정보가 없으면 네 번째 줄 자체를 렌더링하지 않는다', () => {
    render(<EventListRow item={makeEventItem()} onSelect={() => {}} />);
    expect(screen.queryByText(/^📌/)).not.toBeInTheDocument();
  });

  it('클릭하면 onSelect가 해당 아이템으로 호출된다', () => {
    const onSelect = vi.fn();
    const item = makeEventItem();
    render(<EventListRow item={item} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('도시농업 체험'));
    expect(onSelect).toHaveBeenCalledWith(item);
  });
});
