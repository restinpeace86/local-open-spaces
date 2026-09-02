'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMomPickAccess } from '@/hooks/use-mom-pick-access';
import { getMyProfile } from '@/lib/auth/profile';
import { LoginPromptModal } from './login-prompt-modal';
import { SaessakMomGuideModal } from './saessak-mom-guide-modal';
import { PostComposer } from './post-composer';
import { PersonalizedBanner } from './personalized-banner';
import { PreviewSection } from './preview-section';
import { GRADE_LABEL } from '@/lib/community/grades';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 커뮤니티는 로그인
// 사용자만 이용 가능하다. 로그인은 했지만 아직 새싹맘(첫 후기/체크리스트 1회) 조건을
// 못 채운 사용자는 "글쓰기"만 가능하고 피드 열람은 막는다.
//
// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시): "맘스픽 클릭 시"
// 3가지 분기(비로그인/새싹맘 미달성/새싹맘 이상)를 모달로 안내한다. 이 앱에는 "맘스픽"
// 전용 메뉴가 별도 라우트 진입 전 단계에 없고(하단 탭이 아니라 /my 페이지의 링크로
// 진입) `/mom-pick`이 유일한 진입점이므로, 진입 전 별도 확인 대신 이 페이지 마운트
// 직후 접근 상태를 판별해 모달을 띄운다 — 클릭 시점과 페이지 렌더 시점의 UX 결과는
// 동일하다(제한 콘텐츠가 화면에 노출되지 않고 즉시 모달로 안내됨).
//
// [자동 승급] 첫 글 작성 시 grade가 signed_up→sprout로 승급하는 로직은 이미 DB 트리거
// (promote_to_sprout_on_first_post)로 구현·배포돼 있어 별도 클라이언트 코드가 필요
// 없다 — PostComposer가 글을 등록하면 다음 refreshProfile()에서 승급된 값을 그대로
// 받아온다.
type DashboardData = { expert: DashboardPost[]; trending: DashboardPost[]; live: DashboardPost[] };

export function MomPickView() {
  const router = useRouter();
  const { state, profile: initialProfile } = useMomPickAccess();
  const [profile, setProfile] = useState(initialProfile);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  // 새싹맘 미달성 상태에 처음 진입할 때 안내 모달을 연다 — 글 등록 후 승급되면
  // (state가 'allowed'로 바뀌면) 자동으로 닫힌 것처럼 더 이상 조건에 걸리지 않는다.
  useEffect(() => {
    setIsGuideModalOpen(state === 'not_sprout_yet');
  }, [state]);

  useEffect(() => {
    if (state !== 'allowed') return;
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
  }, [state, dashboardKey]);

  async function refreshProfileAfterPost() {
    setDashboardKey((k) => k + 1);
    setProfile(await getMyProfile());
  }

  if (state === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  if (state === 'guest') {
    return (
      <div className="flex-1 flex flex-col p-5">
        <h1 className="text-lg font-bold text-gray-900">👑 맘스픽</h1>
        <LoginPromptModal onClose={() => router.push('/')} />
      </div>
    );
  }

  // state === 'not_sprout_yet' | 'allowed' — 둘 다 로그인은 된 상태.
  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">👑 맘스픽</h1>
        {profile && <span className="text-sm font-medium text-gray-600">{GRADE_LABEL[profile.grade]}</span>}
      </div>

      {state === 'allowed' && profile && <PersonalizedBanner birthYears={profile.birth_years} />}

      <div ref={composerRef}>
        <PostComposer onPosted={refreshProfileAfterPost} />
      </div>

      {state === 'allowed' && (
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

      {isGuideModalOpen && (
        <SaessakMomGuideModal
          onWriteClick={() => {
            setIsGuideModalOpen(false);
            composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onClose={() => router.push('/')}
        />
      )}
    </div>
  );
}
