'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { canAccessCommunityFeed } from '@/lib/community/grades';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시): "맘스픽" 진입 시
// 3가지 분기(비로그인/로그인+새싹맘 미달성/새싹맘 이상)를 판별하는 공용 훅.
//
// [기존 구현과의 용어 대응 — 신규 컬럼을 만들지 않음] 요구사항 원문은 `profiles.tier`
// 컬럼과 `'seed_mom'` 값을 언급하지만, 이 앱은 오늘(2026-09-02) Decision 019로 이미
// `profiles.grade`(값: signed_up/sprout/active/excellent/power)와 "첫 글 작성 시
// grade가 signed_up→sprout로 즉시 승급"하는 DB 트리거(promote_to_sprout_on_first_post,
// scripts/migrations/2026-09-02-mom-pick-instant-sprout-promotion.sql)를 구현·배포해
// 두었다. 요구사항의 "tier='seed_mom'"과 기존 "grade='sprout'(새싹맘)"는 같은 개념을
// 가리키므로, 이미 승인·구현된 컬럼/값을 그대로 쓰고 새 컬럼을 중복 도입하지 않는다
// (제3장 제2조 Spec 우선 — 임의로 스키마를 다시 바꾸지 않음). 자동 승급 로직은 이미
// 동작 중이라 이번 작업에서 새로 만들 필요가 없다.
export type MomPickAccessState = 'loading' | 'guest' | 'not_sprout_yet' | 'allowed';

export function useMomPickAccess(): { state: MomPickAccessState; profile: Profile | null } {
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
  if (!profile || !canAccessCommunityFeed(profile.grade)) return { state: 'not_sprout_yet', profile };
  return { state: 'allowed', profile };
}
