'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile } from '@/lib/auth/profile';
import { addBookmark, BookmarkCapExceededError, BookmarkTarget, getMyBookmarkedIds, removeBookmark } from '@/lib/community/bookmarks';
import { canBookmark } from '@/lib/community/grades';
import { Toast } from '@/components/map/toast';

// [찜 버튼 대비 강화](2026-10-08 사용자 지적: "찜이게 어떤게 누른거고
// 안누른건지... 눈에 안띄어") — 기존엔 ❤️/🤍 이모지로만 구분했는데, 흰
// 배경 카드 위에서 🤍(흰 하트)가 거의 안 보여 구분이 안 됐다. 이모지는
// 플랫폼/폰트에 따라 렌더링 색이 고정돼 CSS로 제어할 수 없어, 직접 그린
// SVG 하트로 바꿔 찜한 상태(루비색 채움)와 안 한 상태(연한 회색 윤곽선만)의
// 대비를 명확히 둔다.
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={filled ? '#e11d48' : 'none'}
      stroke={filled ? '#e11d48' : '#9ca3af'}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-6.72-4.35-9.33-8.2C1.1 10.8 1.5 7.6 4 6c1.8-1.15 4.1-.75 5.4.9L12 9.9l2.6-3c1.3-1.65 3.6-2.05 5.4-.9 2.5 1.6 2.9 4.8 1.33 6.8C18.72 16.65 12 21 12 21z" />
    </svg>
  );
}

// [이마트 문화센터 클래스 찜 추가](2026-10-03) — target 3종(spot/event/emart_class)에서
// id/판별 로직이 늘어 삼항식이 2개씩 겹치면 가독성이 떨어져 작은 헬퍼로 뺐다.
// [롯데마트 문화센터 클래스 찜 추가](2026-10-04) — 4종으로 확장.
function isBookmarkedFor(
  target: BookmarkTarget,
  ids: { spotIds: Set<string>; eventIds: Set<string>; emartClassIds: Set<string>; lottemartClassIds: Set<string> }
): boolean {
  if (target.kind === 'spot') return ids.spotIds.has(target.spotId);
  if (target.kind === 'event') return ids.eventIds.has(target.eventId);
  if (target.kind === 'emart_class') return ids.emartClassIds.has(target.emartClassId);
  return ids.lottemartClassIds.has(target.lottemartClassId);
}

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 찜은 열심맘 이상만
// 가능하다. 자기완결적 컴포넌트로 둬 상세 모달(detail-modal.tsx)이 로그인/등급 상태를
// 알 필요 없게 한다 — 조건 미달이면 조용히 아무것도 렌더링하지 않는다(비대상 사용자를
// 방해하지 않음).
export function BookmarkButton({ target }: { target: BookmarkTarget }) {
  const { user } = useUser();
  const [canShow, setCanShow] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCanShow(false);
      return;
    }
    let cancelled = false;
    Promise.all([getMyProfile(), getMyBookmarkedIds()]).then(([profile, ids]) => {
      if (cancelled) return;
      setCanShow(Boolean(profile && canBookmark(profile.grade)));
      setIsBookmarked(isBookmarkedFor(target, ids));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // [우수맘 전용 예약-알람 슬롯 캡 안내](2026-10-03 사용자 지시) — 캡 초과로 거부된
  // 경우에만 토스트를 띄우고, 그 외 실패(네트워크 오류 등)는 기존처럼 조용히 무시한다
  // (제5장 제11조 — 서비스 중단 금지 취지는 그대로 유지, 캡 거부만 예외).
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  if (!canShow) return null;

  // [낙관적 갱신 — 1~2초 지연 제거](2026-10-09 사용자 지적: "찜하면 이제
  // 색깔 바뀌긴 한데 바뀌기까지 꽤오래걸리네 1~2초걸리는거 같아") 원인은
  // addBookmark/removeBookmark 내부가 auth.getUser → getMyProfile → 캡
  // 개수 확인 → (강좌면) resolveCultureClubClassId → insert/delete까지
  // 최대 5번의 순차 Supabase 왕복을 거치는데, 왕복마다 ~400~600ms 고정
  // 지연이 있다(route.ts의 Branch-First 최적화 때 실측한 것과 동일한
  // 사실) — 그 전체가 끝나야 state를 바꾸던 기존 구조라 체감 지연이 컸다.
  // mom-pick-feed.tsx의 낙관적 갱신 관례와 동일하게, 클릭 즉시 state를
  // 먼저 바꾸고 실패했을 때만 되돌린다(제5장 제4조 기존 구조 우선).
  async function handleToggle() {
    const wasBookmarked = isBookmarked;
    setIsBookmarked(!wasBookmarked);
    setIsBusy(true);
    try {
      if (wasBookmarked) {
        await removeBookmark(target);
      } else {
        await addBookmark(target);
      }
    } catch (err) {
      setIsBookmarked(wasBookmarked); // 실패 시 되돌림
      if (err instanceof BookmarkCapExceededError) {
        setToastMessage(err.message);
      }
      // 그 외 실패는 화면을 막지 않는다(제5장 제11조) — 상태만 되돌린다.
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isBusy}
        aria-label={isBookmarked ? '찜 해제' : '찜하기'}
        className="shrink-0 disabled:opacity-50"
      >
        <HeartIcon filled={isBookmarked} />
      </button>
      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}
