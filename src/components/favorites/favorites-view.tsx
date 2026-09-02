'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { listMyBookmarks, MyBookmark, removeBookmark } from '@/lib/community/bookmarks';
import { canBookmark, GRADE_LABEL } from '@/lib/community/grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 찜(북마크)은 열심맘(active)
// 이상 부여 권한. Decision 003이 지정한 ENABLE_USER_BOOKMARK 플래그의 실제 화면이다.
function BookmarkCard({ bookmark, onRemove }: { bookmark: MyBookmark; onRemove: () => void }) {
  const name = bookmark.open_spaces?.name ?? bookmark.events?.title ?? '알 수 없는 항목';
  const subtitle = bookmark.open_spaces?.address ?? bookmark.events?.venue_name ?? '';

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800">{name}</p>
        {subtitle && <p className="truncate text-xs text-gray-400">{subtitle}</p>}
      </div>
      <button type="button" onClick={onRemove} className="ml-2 shrink-0 text-lg text-rose-400" aria-label="찜 삭제">
        ❤️
      </button>
    </div>
  );
}

export function FavoritesView() {
  const { user, isLoading: isUserLoading } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookmarks, setBookmarks] = useState<MyBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setBookmarks([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([getMyProfile(), listMyBookmarks()])
      .then(([p, b]) => {
        if (!cancelled) {
          setProfile(p);
          setBookmarks(b);
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : '찜 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleRemove(bookmark: MyBookmark) {
    setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    try {
      await removeBookmark(bookmark.spot_id ? { kind: 'spot', spotId: bookmark.spot_id } : { kind: 'event', eventId: bookmark.event_id! });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '찜 삭제에 실패했습니다.');
    }
  }

  if (isUserLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto p-5">
        <h1 className="mb-1 text-lg font-bold text-gray-900">❤️ 찜</h1>
        <p className="mb-4 text-sm text-gray-500">로그인하면 마음에 드는 스팟/행사를 찜할 수 있어요.</p>
        <div className="flex flex-col gap-3">
          <KakaoLoginButton />
          <GoogleLoginButton />
        </div>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  if (!canBookmark(profile.grade)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-5 text-center">
        <h1 className="text-lg font-bold text-gray-900">❤️ 찜</h1>
        <p className="text-sm text-gray-500">
          찜 기능은 🌿 열심맘(월 2회 이상 후기/체크리스트 작성)부터 열려요.
          <br />
          현재 등급: {GRADE_LABEL[profile.grade]}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto p-5">
      <h1 className="text-lg font-bold text-gray-900">❤️ 찜</h1>
      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
      {bookmarks.length === 0 ? (
        <p className="text-sm text-gray-400">아직 찜한 곳이 없어요.</p>
      ) : (
        bookmarks.map((b) => <BookmarkCard key={b.id} bookmark={b} onRemove={() => handleRemove(b)} />)
      )}
    </div>
  );
}
