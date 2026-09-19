import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  // [상시 뱃지 제거](2026-09-17 사용자 지시: "아래 상시는 왜붙였어.. 굳이 상시
  // 노출하지마") — "상시" 성격은 섹션 타이틀이 이미 말해주고 있어 뱃지로 중복
  // 노출하지 않는다.
  it('기간이 없으면 뱃지 자체를 보여주지 않는다', () => {
    render(<CuratedItemDetailModal item={buildItem()} onClose={vi.fn()} />);

    expect(screen.queryByText('🧸 상시')).not.toBeInTheDocument();
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

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): "제휴 상품 상세
// 페이지에서도 연동된 스팟의 최신 상태를 동일하게 체크" — item.spot.id로 발행된
// 공지를 조회하고 레이더를 트리거하는지 검증한다.
describe('CuratedItemDetailModal 네이버 플레이스 공지(2026-09-19)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('연동된 스팟(item.spot.id)으로 발행된 공지를 조회하고 레이더를 트리거한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/spot-notices')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              notices: [{ id: 'n1', curated_title: '팝업 이벤트 안내', curated_content: null, curated_image_url: null }],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CuratedItemDetailModal item={buildItem()} onClose={vi.fn()} />);

    expect(await screen.findByText('🔔 최신 소식')).toBeInTheDocument();
    expect(screen.getByText('🔔 팝업 이벤트 안내')).toBeInTheDocument();

    const noticesCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/spot-notices'));
    expect(noticesCall?.[0]).toBe('/api/spot-notices?spot_id=spot-9');

    const radarCall = fetchMock.mock.calls.find((c) => (c[0] as string) === '/api/spot-notice-radar');
    expect(radarCall).toBeDefined();
    expect(JSON.parse((radarCall![1] as RequestInit).body as string)).toEqual({ spot_id: 'spot-9' });
  });

  it('연동된 스팟이 없으면(item.spot이 null) 공지를 조회하지 않는다', () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    render(<CuratedItemDetailModal item={buildItem({ spot: null })} onClose={vi.fn()} />);

    expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('/api/spot-notices'))).toBe(false);
    expect(screen.queryByText('🔔 최신 소식')).not.toBeInTheDocument();
  });
});
