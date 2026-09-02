import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMyProfile, updateBirthYears } from './profile';

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock }, from: fromMock }),
}));

describe('getMyProfile', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it('로그인하지 않은 상태면 null을 반환한다(에러 아님)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await getMyProfile();
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인 상태면 본인 id로 profiles를 조회해 반환한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const singleMock = vi.fn(() =>
      Promise.resolve({ data: { id: 'user-1', birth_years: [2020], created_at: 't1', updated_at: 't1' }, error: null })
    );
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const result = await getMyProfile();

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
    expect(result).toEqual({ id: 'user-1', birth_years: [2020], created_at: 't1', updated_at: 't1' });
  });

  it('조회 중 에러가 나면 명확한 메시지로 던진다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'DB 오류' } }) }) }),
    });

    await expect(getMyProfile()).rejects.toThrow('프로필 조회 실패: DB 오류');
  });
});

describe('updateBirthYears', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it('로그인하지 않은 상태면 에러를 던진다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(updateBirthYears([2020])).rejects.toThrow('로그인이 필요합니다.');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('로그인 상태면 본인 id 행의 birth_years를 갱신한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const singleMock = vi.fn(() =>
      Promise.resolve({ data: { id: 'user-1', birth_years: [2020, 2022], created_at: 't1', updated_at: 't2' }, error: null })
    );
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const eqMock = vi.fn(() => ({ select: selectMock }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ update: updateMock });

    const result = await updateBirthYears([2020, 2022]);

    expect(fromMock).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ birth_years: [2020, 2022] }));
    expect(eqMock).toHaveBeenCalledWith('id', 'user-1');
    expect(result.birth_years).toEqual([2020, 2022]);
  });

  it('저장 중 에러가 나면 명확한 메시지로 던진다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue({
      update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: '저장 오류' } }) }) }) }),
    });

    await expect(updateBirthYears([2020])).rejects.toThrow('프로필 저장 실패: 저장 오류');
  });
});
