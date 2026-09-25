import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddBookingFab, AddBookingProduct } from './add-booking-fab';

const createBookingMock = vi.fn();
const refreshMock = vi.fn();
const listAvailableSessionsMock = vi.fn();

vi.mock('@/actions/partner/bookings', () => ({
  createBooking: (input: unknown) => createBookingMock(input),
}));

vi.mock('@/actions/partner/sessions', () => ({
  listAvailableSessionsForProduct: (productId: string) => listAvailableSessionsMock(productId),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const FLAT_PRODUCT: AddBookingProduct = { id: 'p1', name: '캠핑사이트 A형', price: 50000, pricing_unit: 'flat', time_mode: 'free' };
const PER_PERSON_PRODUCT: AddBookingProduct = { id: 'p2', name: '입장권', price: 15000, pricing_unit: 'per_person', time_mode: 'free' };
const SESSION_PRODUCT: AddBookingProduct = { id: 'p3', name: '체험 클래스', price: 30000, pricing_unit: 'per_person', time_mode: 'session' };

// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시): FAB 클릭으로
// 시트가 열리고, 기본 날짜가 프리필되며, 제출 시 createBooking을 올바른 값으로
// 호출하고 성공하면 시트가 닫히고 새로고침되는지, 실패하면 폼에 에러가 남는지
// 검증한다.
// [파트너 상품 관리](2026-09-23 사용자 지시): "그냥 상품명으로 통일하고
// 콤보박스로 선택하게 해.. 상품(가격)이 보이고 인원선택하면 끝" — 자유 텍스트
// 입력을 상품 콤보박스로 바꾸고, 선택 시 가격 기준(팀당/인당)에 따라 결제
// 금액이 자동 계산되는지 검증한다.
describe('AddBookingFab', () => {
  afterEach(() => {
    createBookingMock.mockReset();
    refreshMock.mockReset();
    listAvailableSessionsMock.mockReset();
  });

  function openSheet(products?: AddBookingProduct[]) {
    render(<AddBookingFab defaultDate="2026-09-20" products={products} />);
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

  it('products를 전달하면 상품명 선택 목록에 이름과 가격이 함께 보인다', () => {
    openSheet([FLAT_PRODUCT, PER_PERSON_PRODUCT]);

    const select = screen.getByLabelText('상품명(선택)') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(['선택 안 함', '캠핑사이트 A형 (50,000원)', '입장권 (15,000원/인)']);
  });

  it('등록된 상품이 없으면 안내 문구를 보여준다', () => {
    openSheet([]);
    expect(screen.getByText(/등록된 상품이 없어요/)).toBeInTheDocument();
  });

  it('팀당 상품을 선택하면 인원수와 무관하게 상품 가격 그대로 결제 금액에 채워진다', () => {
    openSheet([FLAT_PRODUCT]);

    fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p1' } });
    expect(screen.getByLabelText('결제 금액(선택)')).toHaveValue('50,000');

    fireEvent.click(screen.getByLabelText('인원 늘리기'));
    expect(screen.getByLabelText('결제 금액(선택)')).toHaveValue('50,000');
  });

  it('인당 상품을 선택하면 가격 × 인원수로 결제 금액이 계산되고, 인원이 바뀌면 다시 계산된다', () => {
    openSheet([PER_PERSON_PRODUCT]);

    fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p2' } });
    expect(screen.getByLabelText('결제 금액(선택)')).toHaveValue('15,000');

    fireEvent.click(screen.getByLabelText('인원 늘리기'));
    fireEvent.click(screen.getByLabelText('인원 늘리기'));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('결제 금액(선택)')).toHaveValue('45,000');
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
        session_id: null,
        headcount: 1,
        memo: null,
        product_name: null,
        total_price: null,
      })
    );
  });

  it('상품을 선택하면 상품명과 자동 계산된 결제 금액을 createBooking에 함께 전달한다', async () => {
    createBookingMock.mockResolvedValue({ success: true });
    openSheet([FLAT_PRODUCT]);

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p1' } });
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(createBookingMock).toHaveBeenCalledWith(
        expect.objectContaining({ product_name: '캠핑사이트 A형', total_price: 50000 })
      )
    );
  });

  it('자동 계산된 결제 금액도 직접 고쳐 쓸 수 있다', async () => {
    createBookingMock.mockResolvedValue({ success: true });
    openSheet([FLAT_PRODUCT]);

    const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '김손님' } });
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('결제 금액(선택)'), { target: { value: '40000' } });
    fireEvent.click(screen.getByText('예약 등록'));

    await waitFor(() =>
      expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({ total_price: 40000 }))
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

  // [고정 회차 선택](2026-09-25 사용자 지시): "상품에 대하여 시간도 세팅가능하게
  // 하는건?" → "이 방식으로 구현들어가고" — time_mode='session' 상품을 고르면
  // 자유 날짜/시간 입력 대신 회차를 선택하고, 잔여석이 없는 회차는 고를 수 없다.
  describe('고정 회차 상품', () => {
    it('회차 상품을 선택하면 자유 날짜/시간 입력이 사라지고 회차 목록을 보여준다', async () => {
      listAvailableSessionsMock.mockResolvedValue({
        success: true,
        sessions: [
          { id: 's1', session_date: '2026-10-01', start_time: '10:00:00', end_time: '11:00:00', capacity: 5, remaining: 3 },
          { id: 's2', session_date: '2026-10-01', start_time: '14:00:00', end_time: '15:00:00', capacity: 2, remaining: 0 },
        ],
      });
      openSheet([SESSION_PRODUCT]);

      fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p3' } });

      await waitFor(() => expect(listAvailableSessionsMock).toHaveBeenCalledWith('p3'));
      expect(screen.queryByLabelText('예약 날짜')).not.toBeInTheDocument();
      expect(await screen.findByText('잔여 3명')).toBeInTheDocument();
      expect(screen.getByText('마감')).toBeInTheDocument();
    });

    it('회차를 고르지 않고 제출하면 에러를 보여주고 createBooking을 호출하지 않는다', async () => {
      listAvailableSessionsMock.mockResolvedValue({
        success: true,
        sessions: [{ id: 's1', session_date: '2026-10-01', start_time: '10:00:00', end_time: null, capacity: 5, remaining: 3 }],
      });
      openSheet([SESSION_PRODUCT]);

      fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p3' } });
      await screen.findByText('잔여 3명');

      const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: '김손님' } });
      fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
      fireEvent.click(screen.getByText('예약 등록'));

      expect(await screen.findByText('회차를 선택해 주세요.')).toBeInTheDocument();
      expect(createBookingMock).not.toHaveBeenCalled();
    });

    it('회차를 골라 제출하면 session_id를 채우고 booking_date/booking_time은 null로 보낸다', async () => {
      listAvailableSessionsMock.mockResolvedValue({
        success: true,
        sessions: [{ id: 's1', session_date: '2026-10-01', start_time: '10:00:00', end_time: null, capacity: 5, remaining: 3 }],
      });
      createBookingMock.mockResolvedValue({ success: true });
      openSheet([SESSION_PRODUCT]);

      fireEvent.change(screen.getByLabelText('상품명(선택)'), { target: { value: 'p3' } });
      await screen.findByText('잔여 3명');
      fireEvent.click(screen.getByLabelText(/2026-10-01 10:00/));

      const nameInput = document.querySelector('input[type="text"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: '김손님' } });
      fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '01012345678' } });
      fireEvent.click(screen.getByText('예약 등록'));

      await waitFor(() =>
        expect(createBookingMock).toHaveBeenCalledWith(
          expect.objectContaining({ session_id: 's1', booking_date: null, booking_time: null })
        )
      );
    });
  });
});
