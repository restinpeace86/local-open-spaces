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

  // [낙관적 갱신](2026-10-09 사용자 지적: "찜하면 이제 색깔 바뀌긴 한데
  // 바뀌기까지 꽤오래걸리네 1~2초걸리는거 같아") addBookmark가 최대 5번의
  // 순차 Supabase 왕복을 거쳐 느린데, 응답을 기다리지 않고 클릭 즉시
  // 하트 색(aria-label)이 바뀌어야 한다 — booking-card.test.tsx의 "즉시
  // 활성 표시가 바뀐다" 검증과 동일한 패턴(제5장 제4조).
  it('클릭 즉시(서버 응답 전) 하트 라벨이 바뀌고, 서버 요청이 끝날 때까지 기다리지 않는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    getMyBookmarkedIdsMock.mockResolvedValue({ spotIds: new Set(), eventIds: new Set() });
    let resolveAdd: (() => void) | undefined;
    addBookmarkMock.mockReturnValue(new Promise<void>((resolve) => (resolveAdd = resolve)));

    render(<BookmarkButton target={{ kind: 'spot', spotId: 'spot-1' }} />);
    await waitFor(() => expect(screen.getByLabelText('찜하기')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('찜하기'));
    // addBookmark는 아직 응답하지 않았는데도 즉시 '찜 해제'로 바뀌어야 한다.
    expect(screen.getByLabelText('찜 해제')).toBeTruthy();

    resolveAdd?.();
    await waitFor(() => expect(screen.getByLabelText('찜 해제')).toBeTruthy());
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
