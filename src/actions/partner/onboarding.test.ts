import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitPartnerOnboarding } from './onboarding';

const getUserMock = vi.fn();
const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({ upsert: upsertMock }));
const redirectMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ auth: { getUser: getUserMock }, from: fromMock }),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

const VALID_INPUT = {
  farm_name: '나드리 딸기농장',
  owner_name: '김나드',
  phone: '010-1234-5678',
  image_url: 'https://example.com/farm.jpg',
  address: '경기도 양평군',
  spot_id: 'spot-1',
};

// [나드리픽 파트너 PMS — 온보딩 페이지](2026-09-20 사용자 지시): 필수값 검증, 로그인
// 여부 확인, partners upsert(auth.uid() 기준), 저장 성공 시 /partner로 리다이렉트를
// 검증한다.
describe('submitPartnerOnboarding', () => {
  afterEach(() => {
    getUserMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockClear();
    redirectMock.mockReset();
  });

  it.each([
    ['farm_name', { ...VALID_INPUT, farm_name: '  ' }, '농장 이름을 입력해 주세요.'],
    ['owner_name', { ...VALID_INPUT, owner_name: '' }, '대표자 성함을 입력해 주세요.'],
    ['phone', { ...VALID_INPUT, phone: ' ' }, '연락처를 입력해 주세요.'],
    ['address', { ...VALID_INPUT, address: '' }, '농장 위치 주소를 입력해 주세요.'],
    ['spot_id', { ...VALID_INPUT, spot_id: '' }, '나드리픽 스팟을 연동해 주세요.'],
  ])('%s가 비어 있으면 로그인 확인 없이 검증 에러를 반환한다', async (_field, input, expectedError) => {
    const result = await submitPartnerOnboarding(input);
    expect(result).toEqual({ error: expectedError });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it('이미지는 선택값이라 없어도(null) 통과한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    upsertMock.mockResolvedValue({ error: null });

    await submitPartnerOnboarding({ ...VALID_INPUT, image_url: null });
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }), { onConflict: 'id' });
  });

  it('로그인하지 않았으면 에러를 반환하고 partners를 건드리지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await submitPartnerOnboarding(VALID_INPUT);
    expect(result).toEqual({ error: '로그인이 필요합니다.' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인한 유저의 auth.uid()를 id로 partners에 upsert하고, 성공하면 /partner로 리다이렉트한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    upsertMock.mockResolvedValue({ error: null });

    await submitPartnerOnboarding(VALID_INPUT);

    expect(fromMock).toHaveBeenCalledWith('partners');
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: 'user-1',
        farm_name: '나드리 딸기농장',
        owner_name: '김나드',
        phone: '010-1234-5678',
        image_url: 'https://example.com/farm.jpg',
        address: '경기도 양평군',
        spot_id: 'spot-1',
      },
      { onConflict: 'id' }
    );
    expect(redirectMock).toHaveBeenCalledWith('/partner');
  });

  it('upsert가 실패하면 에러 메시지를 반환하고 리다이렉트하지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    upsertMock.mockResolvedValue({ error: { message: 'DB 오류' } });

    const result = await submitPartnerOnboarding(VALID_INPUT);
    expect(result).toEqual({ error: 'DB 오류' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('앞뒤 공백은 trim해서 저장한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    upsertMock.mockResolvedValue({ error: null });

    await submitPartnerOnboarding({ ...VALID_INPUT, farm_name: '  나드리 딸기농장  ' });
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ farm_name: '나드리 딸기농장' }), { onConflict: 'id' });
  });
});
