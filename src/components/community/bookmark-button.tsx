'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { addBookmark, BookmarkTarget, getMyBookmarkedIds, removeBookmark } from '@/lib/community/bookmarks';
import { canBookmark } from '@/lib/community/grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 찜은 열심맘 이상만
// 가능하다. 자기완결적 컴포넌트로 둬 상세 모달(detail-modal.tsx)이 로그인/등급 상태를
// 알 필요 없게 한다 — 조건 미달이면 조용히 아무것도 렌더링하지 않는다(비대상 사용자를
// 방해하지 않음).
export function BookmarkButton({ target }: { target: BookmarkTarget }) {
  const { user } = useUser();
  const [canShow, setCanShow] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setCanShow(false);
      return;
    }
    let cancelled = false;
    Promise.all([getMyProfile(), getMyBookmarkedIds()]).then(([profile, ids]) => {
      if (cancelled) return;
      setCanShow(Boolean(profile && canBookmark(profile.grade)));
      const id = target.kind === 'spot' ? target.spotId : target.eventId;
      setIsBookmarked(target.kind === 'spot' ? ids.spotIds.has(id) : ids.eventIds.has(id));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!canShow) return null;

  async function handleToggle() {
    setIsBusy(true);
    try {
      if (isBookmarked) {
        await removeBookmark(target);
      } else {
        await addBookmark(target);
      }
      setIsBookmarked((prev) => !prev);
    } catch {
      // 실패해도 화면을 막지 않는다(제5장 제11조) — 상태만 되돌린다.
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isBusy}
      aria-label={isBookmarked ? '찜 해제' : '찜하기'}
      className="shrink-0 text-xl disabled:opacity-50"
    >
      {isBookmarked ? '❤️' : '🤍'}
    </button>
  );
}
