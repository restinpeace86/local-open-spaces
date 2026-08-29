import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationRequestModal } from './reservation-request-modal';

// [예약 신청 폼 UI/UX 고도화](2026-08-29 사용자 지시): 필드별 구체적 검증 메시지, 이중
// 제출 완벽 차단, 접수 성공 시 모달 안에서 완료 화면을 잠깐 보여준 뒤 부드럽게 닫히는
// 흐름(더 이상 window.alert를 쓰지 않음)을 검증한다.
function fillForm({ visitDate = '2099-01-01', headcount = 2, contact = '010-1234-5678' } = {}) {
  fireEvent.change(screen.getByLabelText('방문 날짜'), { target: { value: visitDate } });
  fireEvent.change(screen.getByLabelText('인원 수'), { target: { value: String(headcount) } });
  fireEvent.change(screen.getByLabelText('연락처'), { target: { value: contact } });
}

describe('ReservationRequestModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('필수 항목을 채우고 제출하면 /api/reservations로 POST한다', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ reservation: { id: 'r1' } }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);
    fillForm();
    fireEvent.click(screen.getByText('신청 접수하기'));

    await waitFor(() =>
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
      )
    );
  });

  it(
    '접수 성공 시 완료 화면을 보여주고, 일정 시간 뒤 자동으로 onClose를 호출한다(alert를 쓰지 않음)',
    async () => {
      // 가짜 타이머(vi.useFakeTimers)는 testing-library의 findByText/waitFor 내부 폴링
      // (setTimeout 기반)과 상호작용이 불안정해(전체 스위트 실행 시에만 간헐적으로 재현됨,
      // 단일 파일 실행으로는 재현 안 됨) 실제 시간을 그대로 흘려보내는 방식으로 검증한다 —
      // 지연 시간(1.8초)이 짧아 real timer로도 테스트가 느려지지 않는다.
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({ ok: true, json: () => Promise.resolve({ reservation: { id: 'r1' } }) } as Response)
        )
      );
      const onClose = vi.fn();

      render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />);
      fillForm();
      fireEvent.click(screen.getByText('신청 접수하기'));

      expect(await screen.findByText('신청이 접수되었습니다!')).toBeInTheDocument();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled(); // 곧바로 닫히지 않는다

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3000 });
    },
    5000
  );

  it('방문 날짜가 없으면 구체적인 안내 메시지를 보여준다', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);
    // 네이티브 required 검증을 우회해 컴포넌트 자체의 방어 로직을 검증한다.
    fireEvent.submit(screen.getByText('신청 접수하기').closest('form')!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('방문 날짜를 선택해 주세요.')).toBeInTheDocument();
  });

  it('인원 수를 0으로 입력하면 구체적인 안내 메시지를 보여준다(자동으로 되돌리지 않고 입력값을 그대로 보여줌)', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('방문 날짜'), { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText('인원 수'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '010-1234-5678' } });

    expect(screen.getByLabelText('인원 수')).toHaveValue(0);
    fireEvent.submit(screen.getByText('신청 접수하기').closest('form')!);

    expect(screen.getByText('신청 인원은 1명 이상의 숫자로 입력해 주세요.')).toBeInTheDocument();
  });

  it('인원 수를 비워두면 구체적인 안내 메시지를 보여준다', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('방문 날짜'), { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText('인원 수'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '010-1234-5678' } });
    fireEvent.submit(screen.getByText('신청 접수하기').closest('form')!);

    expect(screen.getByText('신청 인원은 1명 이상의 숫자로 입력해 주세요.')).toBeInTheDocument();
  });

  it('연락처가 없으면 구체적인 안내 메시지를 보여준다', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('방문 날짜'), { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText('인원 수'), { target: { value: '2' } });
    fireEvent.submit(screen.getByText('신청 접수하기').closest('form')!);

    expect(screen.getByText('연락처를 입력해 주세요.')).toBeInTheDocument();
  });

  it('연락처 입력 형식 힌트를 안내한다', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    expect(screen.getByPlaceholderText('010-0000-0000')).toBeInTheDocument();
    expect(screen.getByText('예: 010-1234-5678 형식으로 입력해 주세요.')).toBeInTheDocument();
  });

  it('상단에 신청 안내 문구를 보여준다', () => {
    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);

    expect(
      screen.getByText('전화나 방문 없이 간편하게 무료 예약 신청을 남겨보세요. 담당자 확인 후 연락드립니다.')
    ).toBeInTheDocument();
  });

  it('제출 중에는 버튼이 비활성화되고 "접수 중..."으로 바뀐다', async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);
    fillForm();
    fireEvent.click(screen.getByText('신청 접수하기'));

    const button = await screen.findByText('접수 중...');
    expect(button).toBeDisabled();

    resolveFetch({ ok: true, json: () => Promise.resolve({ reservation: { id: 'r1' } }) });
    await screen.findByText('신청이 접수되었습니다!');
  });

  it('네트워크 응답을 기다리는 동안 연속 클릭해도 요청은 한 번만 나간다(이중 제출 방지)', async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={() => {}} />);
    fillForm();
    const button = screen.getByText('신청 접수하기');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: () => Promise.resolve({ reservation: { id: 'r1' } }) });
    await screen.findByText('신청이 접수되었습니다!');
  });

  it('API가 에러를 반환하면 에러 메시지를 보여주고 onClose는 호출하지 않으며, 다시 시도할 수 있다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '중복된 신청입니다.' }) } as Response))
    );
    const onClose = vi.fn();

    render(<ReservationRequestModal spotId="spot-1" spotName="버섯구지마을" onClose={onClose} />);
    fillForm();
    fireEvent.click(screen.getByText('신청 접수하기'));

    expect(await screen.findByText('중복된 신청입니다.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // 에러 후에도 폼이 그대로 남아 재시도할 수 있어야 한다(버튼이 다시 활성화됨).
    expect(screen.getByText('신청 접수하기')).not.toBeDisabled();
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
