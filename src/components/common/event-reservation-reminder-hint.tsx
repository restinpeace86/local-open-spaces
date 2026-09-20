'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { canBookmark } from '@/lib/community/grades';

// [예약 오픈 알림 — 찜(북마크) 연동](2026-09-20 사용자 지시): "내 알림신청목록은
// 찜했을때 찜한것에 대하여만 알림오도록 하는거지" — 별도 구독 버튼/테이블을 두지
// 않고, 이미 있는 찜(user_bookmarks)을 그대로 구독 신호로 재사용한다(발송 배치가
// user_bookmarks.event_id를 직접 조회). 이 컴포넌트는 "찜하면 이런 혜택이 있다"는
// 안내만 담당하고, 실제 찜 액션은 기존 BookmarkButton이 그대로 처리한다.
//
// [등급 정책](2026-09-20 사용자 확인): "알림도 열심맙 이상만" — 찜 자체가 이미
// 열심맘(active) 이상만 가능하므로(BookmarkButton의 canBookmark와 동일 기준),
// 이 안내도 같은 기준으로 표시한다 — 찜 버튼이 안 보이는 유저에게 "찜하면 알림
// 온다"는 문구만 보이는 불일치를 막기 위함.
function formatOpenAt(iso: string): string {
  const date = new Date(iso);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()}(${weekday}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventReservationReminderHint({ eventId }: { eventId: string }) {
  const { user } = useUser();
  const [nextOpenAt, setNextOpenAt] = useState<string | null>(null);
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNextOpenAt(null);
    fetch(`/api/events/reservation-open-at?event_id=${encodeURIComponent(eventId)}`)
      .then((res) => res.json())
      .then((data: { next_reservation_open_at?: string | null }) => {
        if (!cancelled) setNextOpenAt(data.next_reservation_open_at ?? null);
      })
      .catch(() => {
        if (!cancelled) setNextOpenAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!user) {
      setCanShow(false);
      return;
    }
    let cancelled = false;
    getMyProfile().then((profile) => {
      if (!cancelled) setCanShow(Boolean(profile && canBookmark(profile.grade)));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!canShow || !nextOpenAt || new Date(nextOpenAt).getTime() <= Date.now()) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">🔔 예약 오픈 알림</p>
      <p className="mt-0.5 text-xs text-amber-700">
        {formatOpenAt(nextOpenAt)} 예약 오픈 10분 전에 알려드려요 — 이 이벤트를 찜(❤️)해두면 자동으로 알림을 받아요.
      </p>
    </div>
  );
}
