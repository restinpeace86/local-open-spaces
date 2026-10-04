// [우수맘 전용 예약-알람 슬롯 캡 안내](2026-10-03 사용자 지시) — addBookmark가
// BookmarkCapExceededError를 던지면 토스트로 안내하고, 그 외 실패는 기존처럼 조용히
// 무시하는지(화면을 막지 않는다, 제5장 제11조) 검증한다.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarkButton } from './bookmark-button';

const mockUser = { current: { id: 'user-1' } as { id: string } | null };
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: mockUser.current, isLoading: false }),
}));

const getMyProfileMock = vi.fn();
vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));

const getMyBookmarkedIdsMock = vi.fn();
const addBookmarkMock = vi.fn();
const removeBookmarkMock = vi.fn();
vi.mock('@/lib/community/bookmarks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/community/bookmarks')>();
  return {
    ...actual,
    getMyBookmarkedIds: () => getMyBookmarkedIdsMock(),
    addBookmark: (target: unknown) => addBookmarkMock(target),
    removeBookmark: (target: unknown) => removeBookmarkMock(target),
  };
});
const { BookmarkCapExceededError } = await import('@/lib/community/bookmarks');

describe('BookmarkButton', () => {
  it('addBookmark가 BookmarkCapExceededError를 던지면 토스트로 안내한다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'excellent' });
    getMyBookmarkedIdsMock.mockResolvedValue({ spotIds: new Set(), eventIds: new Set() });
    addBookmarkMock.mockRejectedValue(new BookmarkCapExceededError('예약 알람은 최대 10개까지 찜할 수 있어요.'));

    render(<BookmarkButton target={{ kind: 'event', eventId: 'event-1' }} />);
    await waitFor(() => expect(screen.getByLabelText('찜하기')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('찜하기'));
    });

    await waitFor(() => expect(screen.getByText('예약 알람은 최대 10개까지 찜할 수 있어요.')).toBeTruthy());
  });

  it('일반 에러(네트워크 오류 등)는 토스트 없이 조용히 무시한다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    getMyBookmarkedIdsMock.mockResolvedValue({ spotIds: new Set(), eventIds: new Set() });
    addBookmarkMock.mockRejectedValue(new Error('network error'));

    render(<BookmarkButton target={{ kind: 'spot', spotId: 'spot-1' }} />);
    await waitFor(() => expect(screen.getByLabelText('찜하기')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('찜하기'));
    });

    expect(screen.queryByText(/network error/)).toBeNull();
    expect(screen.getByLabelText('찜하기')).toBeTruthy();
  });

  it('찜이 성공하면 하트가 채워지고 토스트는 뜨지 않는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    getMyBookmarkedIdsMock.mockResolvedValue({ spotIds: new Set(), eventIds: new Set() });
    addBookmarkMock.mockResolvedValue(undefined);

    render(<BookmarkButton target={{ kind: 'spot', spotId: 'spot-1' }} />);
    await waitFor(() => expect(screen.getByLabelText('찜하기')).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByLabelText('찜하기'));
    });

    await waitFor(() => expect(screen.getByLabelText('찜 해제')).toBeTruthy());
  });
});
