import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminReservationsPage from './page';

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시) +
// [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 후속 지시): 목록 조회 +
// 상태 변경(확정/취소) + 상단 요약 카드(전체/대기/확정/취소) + PENDING 행 강조를 검증한다.
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

const DEFAULT_STATUS_COUNTS = { PENDING: 1, CONFIRMED: 2, CANCELLED: 3 };

describe('AdminReservationsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('목록을 불러와 스팟 이름/주소/방문일/인원/연락처/상태를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({ reservations: [makeReservation()], total: 1, statusCounts: DEFAULT_STATUS_COUNTS }),
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
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              reservations: [],
              total: 0,
              statusCounts: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0 },
            }),
        } as Response)
      )
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
        json: () =>
          Promise.resolve({ reservations: [makeReservation()], total: 1, statusCounts: DEFAULT_STATUS_COUNTS }),
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
          json: () =>
            Promise.resolve({
              reservations: [makeReservation({ status: 'CONFIRMED' })],
              total: 1,
              statusCounts: DEFAULT_STATUS_COUNTS,
            }),
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
          json: () =>
            Promise.resolve({ reservations: [makeReservation()], total: 25, statusCounts: DEFAULT_STATUS_COUNTS }),
        } as Response)
      )
    );

    render(<AdminReservationsPage />);
    await screen.findByText('버섯구지마을');

    expect(screen.getByLabelText('다음 페이지')).toBeInTheDocument();
  });

  // [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 사용자 지시)
  describe('상단 요약 카드', () => {
    it('전체/대기/확정/취소 건수를 각각 보여준다', async () => {
      // 행을 CONFIRMED로 둬 액션 버튼("확정"/"취소")이 렌더링되지 않게 한다 — 요약 카드
      // 라벨("확정 완료"/"취소")과 텍스트가 겹치지 않도록 하기 위함(행이 PENDING이면
      // 액션 버튼 "취소"가 요약 카드 라벨 "취소"와 정확히 같은 문자열이 되어 모호해진다).
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                reservations: [makeReservation({ status: 'CONFIRMED' })],
                total: 6,
                statusCounts: DEFAULT_STATUS_COUNTS,
              }),
          } as Response)
        )
      );

      render(<AdminReservationsPage />);
      await screen.findByText('버섯구지마을');

      expect(screen.getByText('전체')).toBeInTheDocument();
      expect(screen.getByText('6건')).toBeInTheDocument();
      expect(screen.getByText('🔴 신규 대기')).toBeInTheDocument();
      expect(screen.getByText('1건')).toBeInTheDocument();
      expect(screen.getByText('확정 완료')).toBeInTheDocument();
      expect(screen.getByText('2건')).toBeInTheDocument();
      expect(screen.getByText('취소')).toBeInTheDocument();
      expect(screen.getByText('3건')).toBeInTheDocument();
    });

    it('데이터를 불러오는 동안에는 카드에 로딩 스켈레톤을 보여준다', () => {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // 영원히 대기(로딩 상태 고정)

      render(<AdminReservationsPage />);

      expect(screen.getByText('전체')).toBeInTheDocument();
      expect(screen.queryByText('0건')).not.toBeInTheDocument();
    });

    it('확정 처리 후 요약 카드의 대기/확정 건수가 즉시 갱신된다(목록을 다시 불러오지 않고)', async () => {
      // CANCELLED를 5로 둬 CONFIRMED가 2→3으로 늘어난 뒤에도 "3건" 표기가 겹치지 않게 한다.
      const initialCounts = { PENDING: 1, CONFIRMED: 2, CANCELLED: 5 };
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ reservation: { ...makeReservation(), status: 'CONFIRMED' } }),
          } as Response);
        }
        return Promise.resolve({
          json: () => Promise.resolve({ reservations: [makeReservation()], total: 8, statusCounts: initialCounts }),
        } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);

      render(<AdminReservationsPage />);
      await screen.findByText('버섯구지마을');
      expect(screen.getByText('1건')).toBeInTheDocument(); // 대기중 1건

      fireEvent.click(screen.getByText('확정'));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // 최초 목록 조회 + PATCH
      // GET을 다시 호출하지 않으므로 목록 조회는 여전히 1번뿐이어야 한다.
      const getCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== 'PATCH');
      expect(getCalls).toHaveLength(1);

      expect(await screen.findByText('0건')).toBeInTheDocument(); // 대기중 0건으로 감소
      expect(screen.getByText('3건')).toBeInTheDocument(); // 확정 2건 → 3건으로 증가
    });
  });

  // [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 사용자 지시)
  describe('PENDING 행 시각적 강조', () => {
    it('PENDING 행은 강조 배경/좌측 강조선 클래스를 갖는다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({ reservations: [makeReservation()], total: 1, statusCounts: DEFAULT_STATUS_COUNTS }),
          } as Response)
        )
      );

      render(<AdminReservationsPage />);
      const nameCell = await screen.findByText('버섯구지마을');
      const row = nameCell.closest('tr')!;

      expect(row).toHaveClass('bg-amber-50', 'border-l-4', 'border-amber-400');
    });

    it('CONFIRMED/CANCELLED 행에는 강조 클래스가 없다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({
                reservations: [makeReservation({ status: 'CONFIRMED' })],
                total: 1,
                statusCounts: DEFAULT_STATUS_COUNTS,
              }),
          } as Response)
        )
      );

      render(<AdminReservationsPage />);
      const nameCell = await screen.findByText('버섯구지마을');
      const row = nameCell.closest('tr')!;

      expect(row).not.toHaveClass('bg-amber-50');
      expect(row).not.toHaveClass('border-l-4');
    });

    it('PENDING 상태 뱃지는 확정/취소보다 눈에 띄는 채워진 색상(bg-amber-500)을 쓴다', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            json: () =>
              Promise.resolve({ reservations: [makeReservation()], total: 1, statusCounts: DEFAULT_STATUS_COUNTS }),
          } as Response)
        )
      );

      render(<AdminReservationsPage />);
      const badge = await screen.findByText('대기중');

      expect(badge).toHaveClass('bg-amber-500', 'text-white');
    });
  });
});
