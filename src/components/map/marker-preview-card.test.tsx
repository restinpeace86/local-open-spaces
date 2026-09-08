import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkerPreviewCard } from './marker-preview-card';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [프리뷰 카드에 대표 이미지/핵심 뱃지 추가](2026-09-08 사용자 지시, todo.md
// 개선사항3-4): "[요약 프리뷰 카드] (대표 이미지, 이름, 핵심 뱃지)"
function makeItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '행복키즈카페',
    category: 'CULTURE',
    distance_meters: 120,
    item_type: 'SPACE',
    lng: 127.1,
    lat: 37.4,
    address: '경기도 성남시 분당구',
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
    category_min: null,
    ...overrides,
  } as NearbyItem;
}

function mockCurationResponse(item: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item }) } as Response))
  );
}

describe('MarkerPreviewCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('큐레이션이 없으면 카테고리 색상 아이콘으로 폴백한다', async () => {
    mockCurationResponse(null);
    render(<MarkerPreviewCard item={makeItem()} onOpenDetail={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText('행복키즈카페')).toBeInTheDocument();
    expect(screen.getByText('🖼️')).toBeInTheDocument();
  });

  it('큐레이션에 대표 이미지와 뱃지가 있으면 그대로 보여준다', async () => {
    mockCurationResponse({
      image_url: 'https://example.com/curated.jpg',
      badge_labels: ['트램폴린/방방', '주차 완비', '수유실 있음'],
    });
    render(<MarkerPreviewCard item={makeItem()} onOpenDetail={vi.fn()} onClose={vi.fn()} />);

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/curated.jpg');
    expect(screen.queryByText('🖼️')).not.toBeInTheDocument();
    // 핵심 뱃지는 최대 2개까지만 보여준다(카드 폭 제약).
    expect(screen.getByText('트램폴린/방방')).toBeInTheDocument();
    expect(screen.getByText('주차 완비')).toBeInTheDocument();
    expect(screen.queryByText('수유실 있음')).not.toBeInTheDocument();
  });

  it('큐레이션 조회가 실패해도 카드 자체는 계속 보여준다(폴백)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('네트워크 오류'))));
    render(<MarkerPreviewCard item={makeItem()} onOpenDetail={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('행복키즈카페')).toBeInTheDocument());
    expect(screen.getByText('🖼️')).toBeInTheDocument();
  });

  it('카드를 클릭하면 상세보기가, ✕를 클릭하면 닫기가 호출된다', async () => {
    mockCurationResponse(null);
    const onOpenDetail = vi.fn();
    const onClose = vi.fn();
    render(<MarkerPreviewCard item={makeItem()} onOpenDetail={onOpenDetail} onClose={onClose} />);

    await screen.findByText('행복키즈카페');
    fireEvent.click(screen.getByLabelText('행복키즈카페 상세보기'));
    expect(onOpenDetail).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('미리보기 닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
