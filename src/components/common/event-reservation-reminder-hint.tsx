'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { canReceivePushNotifications } from '@/lib/community/grades';

// [예약 오픈 알림 — 찜(북마크) 연동](2026-09-20 사용자 지시): "내 알림신청목록은
// 찜했을때 찜한것에 대하여만 알림오도록 하는거지" — 별도 구독 버튼/테이블을 두지
// 않고, 이미 있는 찜(user_bookmarks)을 그대로 구독 신호로 재사용한다(발송 배치가
// user_bookmarks.event_id를 직접 조회). 이 컴포넌트는 "찜하면 이런 혜택이 있다"는
// 안내만 담당하고, 실제 찜 액션은 기존 BookmarkButton이 그대로 처리한다.
//
// [등급 정책 개정 — 2단계 분기](2026-10-03 사용자 지시): "찜기능에대하여 2개로
// 분기해서 우수회원들은 예약 알림기능까지.. 그 아래는.. 그냥 찜해서 찜한것
// 마이페이지 같은데서 볼수 있는기능" — 찜 자체(BookmarkButton)는 그대로
// 열심맘(active) 이상이면 가능하지만, 예약 오픈 알림은 그보다 높은 우수맘
// (excellent) 이상만 받을 수 있도록 분리한다(기존엔 canBookmark와 동일 기준이라
// 열심맘도 알림을 받을 수 있었음 — 2026-09-20 정책을 이번 지시로 개정).
// canReceivePushNotifications(grades.ts)가 정확히 이 기준(excellent 이상)이라
// 새 함수를 만들지 않고 그대로 재사용한다.
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
      if (!cancelled) setCanShow(Boolean(profile && canReceivePushNotifications(profile.grade)));
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
