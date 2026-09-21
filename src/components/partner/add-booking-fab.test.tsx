import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddBookingFab } from './add-booking-fab';

const createBookingMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/actions/partner/bookings', () => ({
  createBooking: (input: unknown) => createBookingMock(input),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시): FAB 클릭으로
// 시트가 열리고, 기본 날짜가 프리필되며, 제출 시 createBooking을 올바른 값으로
// 호출하고 성공하면 시트가 닫히고 새로고침되는지, 실패하면 폼에 에러가 남는지
// 검증한다.
describe('AddBookingFab', () => {
  afterEach(() => {
    createBookingMock.mockReset();
    refreshMock.mockReset();
  });

  function openSheet() {
    render(<AddBookingFab defaultDate="2026-09-20" />);
    fireEvent.click(screen.getByText('+ 예약 추가'));
  }

  it('평소에는 시트가 보이지 않는다', () => {
    render(<AddBookingFab defaultDate="2026-09-20" />);
    expect(screen.queryByText('예약 추가')).not.toBeInTheDocument();
  });

  it('FAB을 클릭하면 시트가 열리고 예약 날짜가 현재 보고 있던 날짜로 프리필된다', () => {
    openSheet();
    expect(screen.getByText('예약 추가')).toBeInTheDocument();
    expect(screen.getByLabelText('예약 날짜')).toHaveValue('2026-09-20');
  });

  it('연락처 입력에 자동으로 하이픈이 붙는다', () => {
    openSheet();
    const phoneInput = screen.getByPlaceholderText('010-0000-0000');
    fireEvent.change(phoneInput, { target: { value: '01012345678' } });
    expect(phoneInput).toHaveValue('010-1234-5678');
  });

  it('결제 금액 입력에 천 단위 콤마가 자동으로 붙는다', () => {
    openSheet();
    const priceInput = screen.getByLabelText('결제 금액(선택)');
    fireEvent.change(priceInput, { target: { value: '50000' } });
    expect(priceInput).toHaveValue('50,000');
  });

  it('recentProductNames를 전달하면 상품명 입력에 자동완성 후보가 보인다', () => {
    render(<AddBookingFab defaultDate="2026-09-20" recentProductNames={['스탠다드룸', '디럭스룸']} />);
    fireEvent.click(screen.getByText('+ 예약 추가'));

    const options = Array.from(document.querySelectorAll('#product-name-suggestions option')).map(
      (el) => (el as HTMLOptionElement).value
    );
    expect(options).toEqual(['스탠다드룸', '디럭스룸']);
  });

  it('+/- 버튼으로 방문 인원을 조절하고, 1명 미만으로는 못 내려간다', () => {
    openSheet();
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('인원 늘리기'));
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('인원 줄이기'));
    fireEvent.click(screen.getByLabelText('인원 줄이기'));
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByLabelText('인원 줄이기')).toBeDisabled();
  });

  it('필수 항목을 채우고 제출하면 createBooking을 올바른 값으로 호출한다', async () => {
    createBookingMock.mockResolvedValue({ success: true });
    openSheet();

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(createBookingMock).toHaveBeenCalledWith({
        customer_name: '김손님',
        customer_phone: '010-1234-5678',
        booking_date: '2026-09-20',
        booking_time: '00:00',
        headcount: 1,
        memo: null,
        product_name: null,
        total_price: null,
      })
    );
  });

  it('상품명/결제 금액을 입력하면 createBooking에 함께 전달한다', async () => {
    createBookingMock.mockResolvedValue({ success: true });
    openSheet();

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText('상품명/객실명(선택)'), { target: { value: '스탠다드룸' } });
    fireEvent.change(screen.getByLabelText('결제 금액(선택)'), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(createBookingMock).toHaveBeenCalledWith(
        expect.objectContaining({ product_name: '스탠다드룸', total_price: 50000 })
      )
    );
  });

  it('등록에 성공하면 시트가 닫히고 router.refresh()가 호출된다', async () => {
    createBookingMock.mockResolvedValue({ success: true });
    openSheet();

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText('예약 추가')).not.toBeInTheDocument();
  });

  it('등록에 실패하면 시트가 열려 있고 폼에 에러 메시지가 보인다', async () => {
    createBookingMock.mockResolvedValue({ error: '예약자명을 입력해 주세요.' });
    openSheet();

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.click(screen.getByText('예약 등록'));

    // 폼 안 에러 문구와 토스트 둘 다 같은 메시지를 보여주므로(요구사항 4) 2개가 뜬다.
    expect(await screen.findAllByText('예약자명을 입력해 주세요.')).toHaveLength(2);
    expect(screen.getByText('예약 추가')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
