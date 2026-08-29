import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationRequestModal } from './reservation-request-modal';

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 날짜/인원수/연락처 3개
// 항목만 받는 최소 신청 폼 — 접수 성공 시 안내 팝업(window.alert) 후 onClose, 실패 시
// 에러 메시지를 보여주고 모달은 열려 있어야 한다(사용자가 값을 고쳐 재시도할 수 있도록).
function fillForm({ visitDate = '2099-01-01', headcount = 2, contact = '010-1234-5678' } = {}) {
  fireEvent.change(screen.getByLabelText('방문 날짜'), { target: { value: visitDate } });
  fireEvent.change(screen.getByLabelText('인원 수'), { target: { value: String(headcount) } });
  fireEvent.change(screen.getByLabelText('연락처'), { target: { value: contact } });
}

describe('ReservationRequestModal', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    alertSpy.mockRestore();
  });

  it('필수 항목을 채우고 제출하면 /api/reservations로 POST하고, 성공 시 안내 팝업 후 onClose를 호출한다', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ reservation: { id: 'r1' } }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />);
    fillForm();
    fireEvent.click(screen.getByText('신청 접수'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reservations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          spot_id: 'spot-1',
          visit_date: '2099-01-01',
          headcount: 2,
          contact: '010-1234-5678',
        }),
      })
    );
    expect(alertSpy).toHaveBeenCalledWith('예약 신청이 정상적으로 접수되었습니다!');
  });

  it('필수 항목이 비어 있으면 API를 호출하지 않고 에러 메시지를 보여준다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);
    // 네이티브 required 검증을 우회해 컴포넌트 자체의 방어 로직을 검증한다.
    fireEvent.submit(screen.getByText('신청 접수').closest('form')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('날짜, 인원 수, 연락처를 모두 입력해 주세요.')).toBeInTheDocument();
  });

  it('API가 에러를 반환하면 에러 메시지를 보여주고 onClose는 호출하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '중복된 신청입니다.' }) } as Response))
    );
    const onClose = vi.fn();

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />);
    fillForm();
    fireEvent.click(screen.getByText('신청 접수'));

    expect(await screen.findByText('중복된 신청입니다.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('배경 클릭/닫기 버튼으로 닫힌다', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />
    );

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('폼 안쪽을 클릭해도 배경 클릭으로 오인해 닫히지 않는다', () => {
    const onClose = vi.fn();
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />);

    fireEvent.click(screen.getByText('📝 간편 예약/신청'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('방문 날짜의 최소 선택 가능일이 오늘로 고정된다(과거 날짜 선택 방지)', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    const todayStr = new Date().toISOString().slice(0, 10);
    expect(screen.getByLabelText('방문 날짜')).toHaveAttribute('min', todayStr);
  });
});
