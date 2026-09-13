import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMomPickAccess } from './use-mom-pick-access';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시): "맘스픽" 진입 시
// 3가지 분기(비로그인/새싹맘 미달성/새싹맘 이상)를 판별하는 useMomPickAccess 검증.
const getUserMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const fromMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: getUserMock, onAuthStateChange: onAuthStateChangeMock }, from: fromMock }),
}));

function mockProfile(grade: string) {
  const singleMock = vi.fn(() =>
    Promise.resolve({ data: { id: 'user-1', birth_years: [], grade, nickname: null, ai_chat_free_uses_used: 0, created_at: 't', updated_at: 't' }, error: null })
  );
  fromMock.mockReturnValue({ select: () => ({ eq: () => ({ single: singleMock }) }) });
}

describe('useMomPickAccess', () => {
  afterEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it('Case 1: 비로그인이면 guest', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useMomPickAccess());

    await waitFor(() => expect(result.current.state).toBe('guest'));
  });

  it('Case 2: 로그인했지만 signed_up(새싹맘 미달성)이면 not_sprout_yet', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile('signed_up');
    const { result } = renderHook(() => useMomPickAccess());

    await waitFor(() => expect(result.current.state).toBe('not_sprout_yet'));
  });

  it('Case 3: sprout 이상이면 allowed', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfile('sprout');
    const { result } = renderHook(() => useMomPickAccess());

    await waitFor(() => expect(result.current.state).toBe('allowed'));
  });

  it('프로필 조회가 실패해도 접근을 잘못 허용하지 않고 not_sprout_yet으로 안전하게 처리한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ single: () => Promise.reject(new Error('network error')) }) }),
    });
    const { result } = renderHook(() => useMomPickAccess());

    await waitFor(() => expect(result.current.state).toBe('not_sprout_yet'));
  });

  // [등업 직후 게이팅 상태가 안 바뀌는 버그 수정](2026-09-13 사용자 지시): "글하나
  // 썼고 새싹맘 됐는데 글쓰기 버튼이나 다른 전체보기 등 누르면 아직 새싹맘 등급이
  // 아니에요 첫글 쓰러가기 나옴" — user는 그대로인 채 첫 글 작성으로 grade만
  // 승급된 상황을 재현한다.
  it('refreshKey가 바뀌면 user가 그대로여도 프로필을 다시 조회해 state를 갱신한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const singleMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: { id: 'user-1', birth_years: [], grade: 'signed_up', nickname: null, ai_chat_free_uses_used: 0, created_at: 't', updated_at: 't' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'user-1', birth_years: [], grade: 'sprout', nickname: null, ai_chat_free_uses_used: 0, created_at: 't', updated_at: 't' },
        error: null,
      });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ single: singleMock }) }) });

    const { result, rerender } = renderHook(({ refreshKey }) => useMomPickAccess(refreshKey), {
      initialProps: { refreshKey: 0 },
    });

    await waitFor(() => expect(result.current.state).toBe('not_sprout_yet'));

    rerender({ refreshKey: 1 });

    await waitFor(() => expect(result.current.state).toBe('allowed'));
    expect(singleMock).toHaveBeenCalledTimes(2);
  });
});
