// [찜 목록 스팟/이벤트 구분](2026-10-03 사용자 지시): "스팟의 찜과 이벤트의 찜은 기능적으로
// 다름 명시(마이페이지 탭에서도 구분해서 볼수있도록)" — 탭 전환 시 spot_id/event_id 기준으로
// 올바르게 걸러지는지, 탭 라벨에 각 건수가 반영되는지 검증한다.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FavoritesView } from './favorites-view';
import type { MyBookmark } from '@/lib/community/bookmarks';

const mockUser = { current: { id: 'user-1' } as { id: string } | null };
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: mockUser.current, isLoading: false }),
}));

const getMyProfileMock = vi.fn();
vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));

const listMyBookmarksMock = vi.fn();
const removeBookmarkMock = vi.fn();
vi.mock('@/lib/community/bookmarks', () => ({
  listMyBookmarks: () => listMyBookmarksMock(),
  removeBookmark: (target: unknown) => removeBookmarkMock(target),
}));

function makeBookmark(overrides: Partial<MyBookmark>): MyBookmark {
  return {
    id: 'bm-1',
    created_at: '2026-10-01T00:00:00Z',
    spot_id: null,
    event_id: null,
    emart_class_id: null,
    open_spaces: null,
    events: null,
    emart_culture_club_classes: null,
    ...overrides,
  };
}

describe('FavoritesView', () => {
  it('탭을 전환하면 spot_id/event_id 기준으로 목록이 갈린다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    listMyBookmarksMock.mockResolvedValue([
      makeBookmark({ id: 'spot-bm', spot_id: 'spot-1', open_spaces: { id: 'spot-1', name: '인사동 스팟', address: '서울', category: '공원' } }),
      makeBookmark({ id: 'event-bm', event_id: 'event-1', events: { id: 'event-1', title: '가을 축제', venue_name: '서울', thumbnail_url: null } }),
    ]);

    render(<FavoritesView />);

    await waitFor(() => expect(screen.getByText('인사동 스팟')).toBeTruthy());
    expect(screen.queryByText('가을 축제')).toBeNull();

    fireEvent.click(screen.getByText('찜한 이벤트 1'));

    await waitFor(() => expect(screen.getByText('가을 축제')).toBeTruthy());
    expect(screen.queryByText('인사동 스팟')).toBeNull();
  });

  it('탭 라벨에 각 종류의 건수를 보여준다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    listMyBookmarksMock.mockResolvedValue([
      makeBookmark({ id: 'spot-bm-1', spot_id: 'spot-1', open_spaces: { id: 'spot-1', name: '스팟 A', address: null, category: '공원' } }),
      makeBookmark({ id: 'spot-bm-2', spot_id: 'spot-2', open_spaces: { id: 'spot-2', name: '스팟 B', address: null, category: '공원' } }),
      makeBookmark({ id: 'event-bm-1', event_id: 'event-1', events: { id: 'event-1', title: '행사 A', venue_name: null, thumbnail_url: null } }),
    ]);

    render(<FavoritesView />);

    await waitFor(() => expect(screen.getByText('찜한 스팟 2')).toBeTruthy());
    expect(screen.getByText('찜한 이벤트 1')).toBeTruthy();
  });

  it('찜한 항목이 없는 탭은 종류에 맞는 빈 상태 문구를 보여준다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    listMyBookmarksMock.mockResolvedValue([]);

    render(<FavoritesView />);

    await waitFor(() => expect(screen.getByText('아직 찜한 스팟이 없어요.')).toBeTruthy());

    fireEvent.click(screen.getByText('찜한 이벤트 0'));
    expect(screen.getByText('아직 찜한 이벤트가 없어요.')).toBeTruthy();
  });

  // [이마트 문화센터 클래스 찜 추가](2026-10-03 사용자 지시): "찜/알람은 같은 기능이니깐
  // 두 테이블 데이터 전부 참조할 수 있도록 확장" — 3번째 탭(문화센터)도 동일하게
  // emart_class_id 기준으로 걸러지는지 검증한다.
  it('문화센터 탭은 emart_class_id 기준으로 걸러지고 강좌명/지점명을 보여준다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    listMyBookmarksMock.mockResolvedValue([
      makeBookmark({ id: 'spot-bm', spot_id: 'spot-1', open_spaces: { id: 'spot-1', name: '인사동 스팟', address: '서울', category: '공원' } }),
      makeBookmark({
        id: 'emart-bm',
        emart_class_id: 'class-1',
        emart_culture_club_classes: { class_id: 'class-1', class_title: '토요 엉클짐', store_name: '스타필드 안성점' },
      }),
    ]);

    render(<FavoritesView />);
    await waitFor(() => expect(screen.getByText('인사동 스팟')).toBeTruthy());

    fireEvent.click(screen.getByText('찜한 문화센터 1'));

    await waitFor(() => expect(screen.getByText('토요 엉클짐')).toBeTruthy());
    expect(screen.getByText('스타필드 안성점')).toBeTruthy();
    expect(screen.queryByText('인사동 스팟')).toBeNull();
  });

  it('문화센터 찜 삭제 시 emart_class 타입으로 removeBookmark를 호출한다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active' });
    listMyBookmarksMock.mockResolvedValue([
      makeBookmark({
        id: 'emart-bm',
        emart_class_id: 'class-1',
        emart_culture_club_classes: { class_id: 'class-1', class_title: '토요 엉클짐', store_name: '스타필드 안성점' },
      }),
    ]);

    render(<FavoritesView />);
    fireEvent.click(await screen.findByText('찜한 문화센터 1'));
    await screen.findByText('토요 엉클짐');

    fireEvent.click(screen.getByLabelText('찜 삭제'));

    expect(removeBookmarkMock).toHaveBeenCalledWith({ kind: 'emart_class', emartClassId: 'class-1' });
  });
});
