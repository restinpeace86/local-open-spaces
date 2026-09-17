import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CuratedItemDetailModal } from './curated-item-detail-modal';
import { CuratedItem } from './best-pick-slider';

function buildItem(overrides: Partial<CuratedItem> = {}): CuratedItem {
  return {
    id: 'c1',
    title: '숲속 키즈카페 이용권',
    image_url: 'https://example.com/img.jpg',
    booking_url: 'https://myrealt.rip/qx',
    category: 'ticket',
    is_active: true,
    operation_start_date: null,
    operation_end_date: null,
    created_at: '2026-09-17T00:00:00Z',
    price_display: '34,900원',
    description: '<p>포함: 입장권</p>',
    spot: { id: 'spot-9', name: '숲속 키즈카페', address: '경기 성남시' },
    ...overrides,
  };
}

// [제휴 상품 상세 뷰 도입](2026-09-17 사용자 지시, todo.md [개선사항 2]): 카드 클릭 →
// 상세 뷰 → 하단 CTA로만 외부 이동하는 흐름을 검증한다.
describe('CuratedItemDetailModal', () => {
  it('타이틀/가격/장소/설명을 보여준다', () => {
    render(<CuratedItemDetailModal item={buildItem()} onClose={vi.fn()} />);

    expect(screen.getByText('숲속 키즈카페 이용권')).toBeInTheDocument();
    expect(screen.getByText('34,900원')).toBeInTheDocument();
    expect(screen.getByText('📍 숲속 키즈카페')).toBeInTheDocument();
    expect(screen.getByText('포함: 입장권')).toBeInTheDocument();
  });

  it('기간(operation_end_date)이 있으면 ⏰ 기간한정 뱃지와 기간 텍스트를 보여준다', () => {
    render(
      <CuratedItemDetailModal
        item={buildItem({ operation_start_date: '2026-10-01', operation_end_date: '2026-10-31' })}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('⏰ 기간한정')).toBeInTheDocument();
    expect(screen.getByText(/2026-10-01 ~ 2026-10-31/)).toBeInTheDocument();
  });

  it('기간이 없으면 🧸 상시 뱃지를 보여준다', () => {
    render(<CuratedItemDetailModal item={buildItem()} onClose={vi.fn()} />);

    expect(screen.getByText('🧸 상시')).toBeInTheDocument();
  });

  it('하단 CTA는 새 창으로 booking_url을 연다', () => {
    render(<CuratedItemDetailModal item={buildItem()} onClose={vi.fn()} />);

    const cta = screen.getByText('예매하러 바로가기 ↗');
    expect(cta).toHaveAttribute('href', 'https://myrealt.rip/qx');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('닫기 버튼을 누르면 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(<CuratedItemDetailModal item={buildItem()} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalled();
  });
});
