import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCultureClubAccess } from './use-culture-club-access';

// [문화센터 열람 권한](2026-10-08 사용자 지시) — use-mom-pick-access.test.ts와
// 동일한 3분기 검증(guest/not_sprout_yet/allowed).
const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

function mockProfile(grade: string) {
  const singleMock = vi.fn(() =>
    Promise.resolve({ data: { id: 'user-1', birth_years: [2024], birth_months: [1], grade, nickname: '테스트', ai_chat_free_uses_used: 0, created_at: 't', updated_at: 't' }, error: null })
  );
  fromMock.mockReturnValue({ select: () => ({ eq: () => ({ single: singleMock }) }) });
}

describe('useCultureClubAccess', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it('비로그인이면 guest', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useCultureClubAccess());

    await waitFor(() => expect(result.current.state).toBe('guest'));
  });

  it('로그인했지만 signed_up(새싹맘 미달성)이면 not_sprout_yet', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile('signed_up');
    const { result } = renderHook(() => useCultureClubAccess());

    await waitFor(() => expect(result.current.state).toBe('not_sprout_yet'));
  });

  it('sprout 이상이면 allowed', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile('sprout');
    const { result } = renderHook(() => useCultureClubAccess());

    await waitFor(() => expect(result.current.state).toBe('allowed'));
  });

  it('프로필 조회가 실패해도 접근을 잘못 허용하지 않고 not_sprout_yet으로 안전하게 처리한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.reject(new Error('network error')) }) }),
    });
    const { result } = renderHook(() => useCultureClubAccess());

    await waitFor(() => expect(result.current.state).toBe('not_sprout_yet'));
  });
});
