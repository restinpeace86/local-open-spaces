'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, Profile } from '@/lib/auth/profile';
import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { PostComposer } from './post-composer';
import { PersonalizedBanner } from './personalized-banner';
import { PreviewSection } from './preview-section';
import { canAccessCommunityFeed, GRADE_LABEL } from '@/lib/community/grades';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 커뮤니티는 로그인
// 사용자만 이용 가능하다. 로그인은 했지만 아직 새싹맘(첫 후기/체크리스트 1회) 조건을
// 못 채운 사용자는 "글쓰기"만 가능하고 피드 열람은 막는다(1절 표 그대로) — 첫 글을 쓰는
// 순간 DB 트리거(promote_to_sprout_on_first_post)가 즉시 승급시키므로, 등록 성공 후
// 프로필을 다시 조회하면 바로 피드가 열린다.
//
// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): "모든 글이 무작위로 섞이는 피드가
// 아니라 철저히 검증된 3가지 핵심 영역(Preview + 전체보기 구조)" — 기존 단일
// MomPickFeed(최신순 전체 나열)를 메인 화면에서 걷어내고, 파워맘/우수맘 추천·인기글·
// 실시간 피드 3개 섹션의 미리보기(/api/mom-pick/dashboard, 각 섹션 DB 레벨 LIMIT 3~5)로
// 대체한다. MomPickFeed 컴포넌트 자체는 삭제하지 않았다(추후 재사용 가능성 — 임의
// 기능 제거 금지 원칙).
type DashboardData = { expert: DashboardPost[]; trending: DashboardPost[]; live: DashboardPost[] };

export function MomPickView() {
  const { user, isLoading: isUserLoading } = useUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0);

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

  useEffect(() => {
    if (!user || !profile || !canAccessCommunityFeed(profile.grade)) return;
    let cancelled = false;
    fetch('/api/mom-pick/dashboard')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setDashboardError(data.error);
        else setDashboard(data);
      })
      .catch(() => {
        if (!cancelled) setDashboardError('맘스픽 피드를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, dashboardKey]);

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
          {canAccessCommunityFeed(profile.grade) && <PersonalizedBanner birthYears={profile.birth_years} />}

          {!canAccessCommunityFeed(profile.grade) && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
              첫 후기나 체크리스트를 남기면 다른 엄마들의 피드를 볼 수 있어요! 🌱
            </p>
          )}

          <PostComposer
            onPosted={() => {
              setDashboardKey((k) => k + 1);
              refreshProfile();
            }}
          />

          {canAccessCommunityFeed(profile.grade) && (
            <>
              {dashboardError && <p className="text-xs text-red-600">{dashboardError}</p>}
              {!dashboard && !dashboardError ? (
                <p className="text-sm text-gray-400">피드를 불러오는 중...</p>
              ) : dashboard ? (
                <div className="flex flex-col gap-6">
                  <PreviewSection
                    title="✨ 파워맘 · 우수맘 추천"
                    href="/mom-pick/expert"
                    posts={dashboard.expert}
                    emptyText="아직 파워맘/우수맘 추천 글이 없어요."
                  />
                  <PreviewSection
                    title="🔥 인기 · 우수글"
                    href="/mom-pick/trending"
                    posts={dashboard.trending}
                    emptyText="아직 인기글이 없어요."
                  />
                  <PreviewSection
                    title="🕐 실시간 라이브"
                    href="/mom-pick/live"
                    posts={dashboard.live}
                    emptyText="아직 등록된 글이 없어요."
                  />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
