import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminReservationsPage from './page';

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): 목록 조회 + 상태 변경
// (확정/취소) 흐름을 검증한다.
function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    spot_id: 'spot-1',
    contact: '010-1234-5678',
    visit_date: '2026-09-15',
    headcount: 3,
    status: 'PENDING',
    created_at: '2026-08-29T10:00:00+00:00',
    open_spaces: { name: '버섯구지마을', address: '경기도 가평군 하면 대보간선로 173' },
    ...overrides,
  };
}

describe('AdminReservationsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('목록을 불러와 스팟 이름/주소/방문일/인원/연락처/상태를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ reservations: [makeReservation()], total: 1 }),
        } as Response)
      )
    );

    render(<AdminReservationsPage />);

    expect(await screen.findByText('버섯구지마을')).toBeInTheDocument();
    expect(screen.getByText('경기도 가평군 하면 대보간선로 173')).toBeInTheDocument();
    expect(screen.getByText('2026-09-15')).toBeInTheDocument();
    expect(screen.getByText('3명')).toBeInTheDocument();
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
    expect(screen.getByText('대기중')).toBeInTheDocument();
  });

  it('접수 내역이 없으면 안내 문구를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ reservations: [], total: 0 }) } as Response))
    );

    render(<AdminReservationsPage />);

    expect(await screen.findByText('접수된 예약/신청이 없습니다.')).toBeInTheDocument();
  });

  it('PENDING 건에만 확정/취소 버튼이 보이고, 확정을 누르면 PATCH 요청 후 상태 뱃지가 즉시 바뀐다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ reservation: { ...makeReservation(), status: 'CONFIRMED' } }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({ reservations: [makeReservation()], total: 1 }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminReservationsPage />);
    await screen.findByText('버섯구지마을');

    const confirmButton = screen.getByText('확정');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/reservations',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ id: 'r1', status: 'CONFIRMED' }),
        })
      );
    });
    expect(await screen.findByText('확정')).toBeInTheDocument(); // 상태 뱃지 라벨
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('이미 확정/취소된 건에는 액션 버튼이 뜨지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ reservations: [makeReservation({ status: 'CONFIRMED' })], total: 1 }),
        } as Response)
      )
    );

    render(<AdminReservationsPage />);
    await screen.findByText('버섯구지마을');

    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
  });

  it('페이지가 1개를 넘으면 페이지네이션을 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ reservations: [makeReservation()], total: 25 }),
        } as Response)
      )
    );

    render(<AdminReservationsPage />);
    await screen.findByText('버섯구지마을');

    expect(screen.getByLabelText('다음 페이지')).toBeInTheDocument();
  });
});
