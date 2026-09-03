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
  // [todo.md 개선사항 10](2026-09-03): 비로그인 사용자가 "글쓰기"를 눌렀을 때만 여는
  // Soft-wall 모달 — 페이지 진입 즉시(state==='guest') 여는 게 아니라, 실제로 쓰려고
  // 시도하는 그 순간에만 연다는 점이 기존 LoginPromptModal 용례(진입 즉시 강제)와 다르다.
  const [isGuestWritePromptOpen, setIsGuestWritePromptOpen] = useState(false);
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

  // [todo.md 개선사항 10](2026-09-03): "맘스픽 메인 화면은 비로그인도 View-Only로 접근
  // 허용" — 이전에는 state==='allowed'일 때만 피드를 불러왔지만, 이제 게스트도 열람은
  // 가능해야 하므로 'guest'도 함께 허용한다('not_sprout_yet'은 이번 지시 범위 밖이라
  // 기존처럼 그대로 제외 — 로그인은 했지만 첫 글을 아직 안 쓴 사용자에게는 여전히
  // 글쓰기 유도 화면만 보여준다).
  useEffect(() => {
    if (state !== 'allowed' && state !== 'guest') return;
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

  // [todo.md 개선사항 10](2026-09-03): 'guest' | 'not_sprout_yet' | 'allowed' 셋 다 같은
  // 레이아웃(헤더 + 글쓰기 영역 + 피드)을 공유한다 — 다른 점은 글쓰기 영역이 실제
  // PostComposer인지 로그인 유도 CTA인지, 그리고 피드가 노출되는지뿐이다. 이전에는
  // 'guest'만 별도의 하드 블록 화면(피드 자체를 렌더링하지 않음)을 썼는데, 이제 그
  // 분기를 없애 View-Only 열람이 자연스럽게 가능해진다.
  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">👑 맘스픽</h1>
        {profile && <span className="text-sm font-medium text-gray-600">{GRADE_LABEL[profile.grade]}</span>}
      </div>

      {state === 'allowed' && profile && <PersonalizedBanner birthYears={profile.birth_years} />}

      <div ref={composerRef}>
        {state === 'guest' ? (
          // [todo.md 개선사항 10](2026-09-03) Soft-wall: 실제 작성 폼(SpotPicker/별점/
          // 체크리스트)은 전혀 렌더링하지 않고, 클릭하는 즉시 로그인 유도만 띄운다 —
          // 개선사항 8과 동일한 원칙("입력을 시작하기 전에 막는다").
          <button
            type="button"
            onClick={() => setIsGuestWritePromptOpen(true)}
            className="w-full rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            ✍️ 로그인하고 후기·체크리스트 남기기
          </button>
        ) : (
          <PostComposer onPosted={refreshProfileAfterPost} />
        )}
      </div>

      {(state === 'allowed' || state === 'guest') && (
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

      {isGuestWritePromptOpen && <LoginPromptModal onClose={() => setIsGuestWritePromptOpen(false)} />}
    </div>
  );
}
