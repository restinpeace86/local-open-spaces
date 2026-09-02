'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { PostComposer } from './post-composer';
import { MomPickFeed } from './mom-pick-feed';
import { canAccessCommunityFeed, GRADE_LABEL } from '@/lib/community/grades';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 커뮤니티는 로그인
// 사용자만 이용 가능하다. 로그인은 했지만 아직 새싹맘(첫 후기/체크리스트 1회) 조건을
// 못 채운 사용자는 "글쓰기"만 가능하고 피드 열람은 막는다(1절 표 그대로) — 첫 글을 쓰는
// 순간 DB 트리거(promote_to_sprout_on_first_post)가 즉시 승급시키므로, 등록 성공 후
// 프로필을 다시 조회하면 바로 피드가 열린다.
export function MomPickView() {
  const { user, isLoading: isUserLoading } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [feedKey, setFeedKey] = useState(0);

  async function refreshProfile() {
    setIsProfileLoading(true);
    try {
      setProfile(await getMyProfile());
    } finally {
      setIsProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
        <h1 className="mb-1 text-lg font-bold text-gray-900">👑 맘스픽</h1>
        <p className="mb-4 text-sm text-gray-500">로그인하면 다른 엄마들의 생생한 후기와 체크리스트를 볼 수 있어요.</p>
        <div className="flex flex-col gap-3">
          <KakaoLoginButton />
          <GoogleLoginButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">👑 맘스픽</h1>
        {profile && <span className="text-sm font-medium text-gray-600">{GRADE_LABEL[profile.grade]}</span>}
      </div>

      {isProfileLoading || !profile ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : (
        <>
          {!canAccessCommunityFeed(profile.grade) && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              첫 후기나 체크리스트를 남기면 다른 엄마들의 피드를 볼 수 있어요! 🌱
            </p>
          )}

          <PostComposer
            onPosted={() => {
              setFeedKey((k) => k + 1);
              refreshProfile();
            }}
          />

          {canAccessCommunityFeed(profile.grade) && <MomPickFeed key={feedKey} myGrade={profile.grade} />}
        </>
      )}
    </div>
  );
}
