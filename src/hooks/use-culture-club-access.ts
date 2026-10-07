'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { canViewCultureClub } from '@/lib/community/grades';

// [문화센터 열람 권한](2026-10-08 사용자 지시): "문화센터 볼수 있는 권한에 대하여
// 로그인 유저? 새싹맘부터... 그래서 아이 연 월 생 관련 입력된 사람들만 볼수
// 있게해줘" — use-mom-pick-access.ts와 동일한 3분기 패턴(제5장 제4조 기존
// 구조 우선). "아이 연월생 입력"은 canViewCultureClub(grades.ts) 주석 참고 —
// ProfileCompletionGuard가 이미 전역으로 강제하고 있어 별도 체크가 필요 없다.
export type CultureClubAccessState = 'loading' | 'guest' | 'not_sprout_yet' | 'allowed';

export function useCultureClubAccess(): { state: CultureClubAccessState; profile: Profile | null } {
  const { user, isLoading: isUserLoading } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setIsProfileLoading(true);
    getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // 조회 실패해도 서비스 중단 없이 "새싹맘 미달성"으로 안전하게 취급한다
        // (제5장 제11조 오류 처리 원칙 — 실패를 이유로 접근을 잘못 허용하지 않음).
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isUserLoading || (user && isProfileLoading)) return { state: 'loading', profile };
  if (!user) return { state: 'guest', profile: null };
  if (!profile || !canViewCultureClub(profile.grade)) return { state: 'not_sprout_yet', profile };
  return { state: 'allowed', profile };
}
