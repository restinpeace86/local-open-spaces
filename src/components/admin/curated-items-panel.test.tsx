import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CuratedItemsPanel } from './curated-items-panel';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시): 목록 조회/검색·날짜 필터/원클릭 노출 토글/등록·수정 모달을 검증한다.
function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    title: '가을 단풍 나들이 축제 입장권',
    image_url: null,
    booking_url: 'https://example.com/tickets/autumn',
    category: 'ticket',
    is_active: true,
    operation_start_date: null,
    operation_end_date: null,
    created_at: '2026-08-29T00:00:00+00:00',
    ...overrides,
  };
}

describe('CuratedItemsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('목록을 불러와 상품명/카테고리/운영기간/등록일을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [makeItem()], total: 1 }),
        } as Response)
      )
    );

    render(<CuratedItemsPanel />);
    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 마운트 시 자동 조회하지 않으므로
    // 이제 명시적으로 조회하기를 눌러야 fetch가 나간다.
    fireEvent.click(screen.getByText('📥 불러오기'));

    expect(await screen.findByText('가을 단풍 나들이 축제 입장권')).toBeInTheDocument();
    expect(screen.getByText('ticket (티켓/체험)')).toBeInTheDocument();
    expect(screen.getByText('상시')).toBeInTheDocument();
  });

  it('상품이 없으면 안내 문구를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) } as Response))
    );

    render(<CuratedItemsPanel />);
    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 마운트 시 자동 조회하지 않으므로
    // 이제 명시적으로 조회하기를 눌러야 fetch가 나간다.
    fireEvent.click(screen.getByText('📥 불러오기'));

    expect(await screen.findByText('조건에 맞는 상품이 없습니다.')).toBeInTheDocument();
  });

  it('토글 버튼을 누르면 즉시 PATCH가 나가고 뱃지 상태가 바뀐다(목록 재조회 없음)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ item: { ...makeItem(), is_active: false } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [makeItem()], total: 1 }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CuratedItemsPanel />);
    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 마운트 시 자동 조회하지 않으므로
    // 이제 명시적으로 조회하기를 눌러야 fetch가 나간다.
    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('가을 단풍 나들이 축제 입장권');

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/curated-items',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ id: 'item-1', is_active: false }),
        })
      );
    });
    expect(await screen.findByRole('switch')).toHaveAttribute('aria-checked', 'false');

    // 목록을 다시 불러오는 GET이 추가로 나가지 않아야 한다(로컬 갱신만).
    const getCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'PATCH');
    expect(getCalls).toHaveLength(1);
  });

  it('[+ 신규 상품 등록] 클릭 시 빈 등록 폼이 뜨고, 제출하면 목록 맨 앞에 추가된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              item: makeItem({ id: 'new-item', title: '신규 등록 상품' }),
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], total: 0 }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CuratedItemsPanel />);
    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 마운트 시 자동 조회하지 않으므로
    // 이제 명시적으로 조회하기를 눌러야 fetch가 나간다.
    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('조건에 맞는 상품이 없습니다.');

    fireEvent.click(screen.getByText('+ 신규 상품 등록'));
    expect(await screen.findByText('+ 신규 상품 등록', { selector: 'h2' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '신규 등록 상품' } });
    fireEvent.change(screen.getByLabelText('제휴 링크(booking_url)'), {
      target: { value: 'https://example.com/new' },
    });
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => expect(screen.queryByText('등록하기')).not.toBeInTheDocument());
    expect(await screen.findByText('신규 등록 상품')).toBeInTheDocument();
  });

  it('[수정] 클릭 시 기존 값이 채워진 폼이 뜬다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [makeItem({ category: 'coupang' })], total: 1 }),
        } as Response)
      )
    );

    render(<CuratedItemsPanel />);
    // [관리자 페이지 성능 최적화](2026-08-30 사용자 지시): 마운트 시 자동 조회하지 않으므로
    // 이제 명시적으로 조회하기를 눌러야 fetch가 나간다.
    fireEvent.click(screen.getByText('📥 불러오기'));
    await screen.findByText('가을 단풍 나들이 축제 입장권');

    fireEvent.click(screen.getByText('수정'));

    expect(await screen.findByText('상품 수정')).toBeInTheDocument();
    expect(screen.getByLabelText('상품명')).toHaveValue('가을 단풍 나들이 축제 입장권');
    expect(screen.getByLabelText('제휴 링크(booking_url)')).toHaveValue('https://example.com/tickets/autumn');
  });
});
