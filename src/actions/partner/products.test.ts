import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPartnerProduct, deletePartnerProduct, updatePartnerProduct } from './products';

const getUserMock = vi.fn();
const insertMock = vi.fn();
const updateEqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const deleteEqMock = vi.fn();
const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
const fromMock = vi.fn(() => ({ insert: insertMock, update: updateMock, delete: deleteMock }));
const revalidatePathMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));

const VALID_INPUT = { name: '캠핑사이트 A형', price: 50000, pricing_unit: 'flat' as const };

function resetAll() {
  getUserMock.mockReset();
  insertMock.mockReset();
  updateEqMock.mockReset();
  updateMock.mockClear();
  deleteEqMock.mockReset();
  deleteMock.mockClear();
  fromMock.mockClear();
  revalidatePathMock.mockReset();
}

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할
// 수 있게" — 필수값 검증, 로그인 확인, partner_id 자동 주입(auth.uid()), 성공 시
// /partner/more/products·/partner/today revalidate를 검증한다(bookings.ts와
// 동일한 관례).
describe('createPartnerProduct', () => {
  afterEach(resetAll);

  it.each([
    ['name(공백)', { ...VALID_INPUT, name: '  ' }, '상품명을 입력해 주세요.'],
    ['price(음수)', { ...VALID_INPUT, price: -1 }, '가격은 0 이상의 숫자로 입력해 주세요.'],
    ['price(소수)', { ...VALID_INPUT, price: 100.5 }, '가격은 0 이상의 숫자로 입력해 주세요.'],
    ['pricing_unit(잘못된 값)', { ...VALID_INPUT, pricing_unit: 'weird' as never }, '가격 기준이 올바르지 않습니다.'],
  ])('%s가 유효하지 않으면 로그인 확인 없이 검증 에러를 반환한다', async (_field, input, expectedError) => {
    const result = await createPartnerProduct(input);
    expect(result).toEqual({ error: expectedError });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 에러를 반환하고 partner_products를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await createPartnerProduct(VALID_INPUT);
    expect(result).toEqual({ error: '로그인이 필요합니다.' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인한 유저의 auth.uid()를 partner_id로 자동 주입해 insert한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: null });

    const result = await createPartnerProduct(VALID_INPUT);

    expect(result).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith('partner_products');
    expect(insertMock).toHaveBeenCalledWith({
      partner_id: 'user-1',
      name: '캠핑사이트 A형',
      price: 50000,
      pricing_unit: 'flat',
    });
  });

  it('성공하면 /partner/more/products와 /partner/today를 revalidate한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: null });

    await createPartnerProduct(VALID_INPUT);
    expect(revalidatePathMock).toHaveBeenCalledWith('/partner/more/products');
    expect(revalidatePathMock).toHaveBeenCalledWith('/partner/today');
  });

  it('DB insert가 실패하면 에러 메시지를 반환하고 revalidate하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    insertMock.mockResolvedValue({ error: { message: 'DB 오류' } });

    const result = await createPartnerProduct(VALID_INPUT);
    expect(result).toEqual({ error: 'DB 오류' });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('updatePartnerProduct', () => {
  afterEach(resetAll);

  it('로그인했으면 partner_products.id로만 update를 호출한다(RLS가 소유권을 강제)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    updateEqMock.mockResolvedValue({ error: null });

    const result = await updatePartnerProduct('product-1', { ...VALID_INPUT, pricing_unit: 'per_person' });

    expect(result).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith('partner_products');
    expect(updateMock).toHaveBeenCalledWith({ name: '캠핑사이트 A형', price: 50000, pricing_unit: 'per_person' });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'product-1');
  });
});

describe('deletePartnerProduct', () => {
  afterEach(resetAll);

  it('로그인하지 않았으면 에러를 반환하고 partner_products를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await deletePartnerProduct('product-1');
    expect(result).toEqual({ error: '로그인이 필요합니다.' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인했으면 partner_products.id로만 delete를 호출한다(RLS가 소유권을 강제)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    deleteEqMock.mockResolvedValue({ error: null });

    const result = await deletePartnerProduct('product-1');

    expect(result).toEqual({ success: true });
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'product-1');
  });
});
