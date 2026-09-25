import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsManager } from './products-manager';

const createMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const refreshMock = vi.fn();

const listSessionsMock = vi.fn();

vi.mock('@/actions/partner/products', () => ({
  createPartnerProduct: (input: unknown) => createMock(input),
  updatePartnerProduct: (id: string, input: unknown) => updateMock(id, input),
  deletePartnerProduct: (id: string) => deleteMock(id),
}));

vi.mock('@/actions/partner/sessions', () => ({
  listProductSessions: (productId: string) => listSessionsMock(productId),
  createProductSession: vi.fn(),
  updateProductSession: vi.fn(),
  deleteProductSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const PRODUCT = { id: 'p1', name: '캠핑사이트 A형', price: 50000, pricing_unit: 'flat' as const, time_mode: 'free' as const };
const SESSION_PRODUCT = { id: 'p2', name: '체험 클래스', price: 30000, pricing_unit: 'per_person' as const, time_mode: 'session' as const };

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할
// 수 있게해놓고 거기있는 데이터 가져와서 리스트로 나오게" — 목록 표시, 추가/수정/
// 삭제 폼이 올바른 값으로 액션을 호출하는지 검증한다.
describe('ProductsManager', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    refreshMock.mockReset();
    listSessionsMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('상품이 없으면 안내 문구를 보여준다', () => {
    render(<ProductsManager initialProducts={[]} />);
    expect(screen.getByText(/등록된 상품이 없어요/)).toBeInTheDocument();
  });

  it('상품 목록을 이름/가격/가격 기준과 함께 보여준다', () => {
    render(<ProductsManager initialProducts={[PRODUCT]} />);
    expect(screen.getByText('캠핑사이트 A형')).toBeInTheDocument();
    expect(screen.getByText('50,000원 · 팀당(인원수 무관) · 자유 시간')).toBeInTheDocument();
  });

  it('상품 추가 버튼을 누르면 폼이 열리고, 제출하면 createPartnerProduct를 호출한다', async () => {
    createMock.mockResolvedValue({ success: true });
    render(<ProductsManager initialProducts={[]} />);

    fireEvent.click(screen.getByText('+ 상품 추가'));
    fireEvent.change(screen.getByPlaceholderText('예: 캠핑사이트 A형(1박)'), { target: { value: '입장권' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '15000' } });
    fireEvent.click(screen.getByLabelText('인당(인원수만큼 곱함)'));
    fireEvent.click(screen.getByText('상품 추가'));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: '입장권', price: 15000, pricing_unit: 'per_person', time_mode: 'free' })
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('수정 버튼을 누르면 기존 값이 채워진 폼이 열리고, 제출하면 updatePartnerProduct를 호출한다', async () => {
    updateMock.mockResolvedValue({ success: true });
    render(<ProductsManager initialProducts={[PRODUCT]} />);

    fireEvent.click(screen.getByText('수정'));
    const nameInput = screen.getByDisplayValue('캠핑사이트 A형');
    fireEvent.change(nameInput, { target: { value: '캠핑사이트 B형' } });
    fireEvent.click(screen.getByText('수정 완료'));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('p1', { name: '캠핑사이트 B형', price: 50000, pricing_unit: 'flat', time_mode: 'free' })
    );
  });

  it('삭제 버튼을 누르면 확인 후 deletePartnerProduct를 호출한다', async () => {
    deleteMock.mockResolvedValue({ success: true });
    render(<ProductsManager initialProducts={[PRODUCT]} />);

    fireEvent.click(screen.getByText('삭제'));

    expect(window.confirm).toHaveBeenCalledWith('"캠핑사이트 A형" 상품을 삭제할까요?');
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('p1'));
  });

  it('확인 대화상자를 취소하면 삭제하지 않는다', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    render(<ProductsManager initialProducts={[PRODUCT]} />);

    fireEvent.click(screen.getByText('삭제'));
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('고정 회차를 선택해 상품을 추가하면 time_mode: session으로 저장한다', async () => {
    createMock.mockResolvedValue({ success: true });
    render(<ProductsManager initialProducts={[]} />);

    fireEvent.click(screen.getByText('+ 상품 추가'));
    fireEvent.change(screen.getByPlaceholderText('예: 캠핑사이트 A형(1박)'), { target: { value: '체험 클래스' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '30000' } });
    fireEvent.click(screen.getByLabelText('고정 회차'));
    fireEvent.click(screen.getByText('상품 추가'));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ name: '체험 클래스', price: 30000, pricing_unit: 'flat', time_mode: 'session' })
    );
  });

  it('고정 회차 상품에서 회차 관리를 열면 등록된 회차 목록을 보여준다', async () => {
    listSessionsMock.mockResolvedValue({
      success: true,
      sessions: [{ id: 's1', session_date: '2026-10-01', start_time: '10:00:00', end_time: '11:00:00', capacity: 5, booked: 2 }],
    });
    render(<ProductsManager initialProducts={[SESSION_PRODUCT]} />);

    fireEvent.click(screen.getByText('회차 관리 ▼'));

    await waitFor(() => expect(listSessionsMock).toHaveBeenCalledWith('p2'));
    expect(await screen.findByText('2/5명')).toBeInTheDocument();
    expect(screen.getByText('2026-10-01 10:00~11:00')).toBeInTheDocument();
  });
});
