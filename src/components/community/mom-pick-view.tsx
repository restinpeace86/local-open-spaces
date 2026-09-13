'use client';

import { useEffect, useState } from 'react';
import { useMomPickAccess } from '@/hooks/use-mom-pick-access';
import { getMyProfile } from '@/lib/auth/profile';
import { LoginPromptModal } from './login-prompt-modal';
import { SaessakMomGuideModal } from './saessak-mom-guide-modal';
import { SurveyReviewComposer } from './survey-review-composer';
import { PersonalizedBanner } from './personalized-banner';
import { PreviewSection } from './preview-section';
import { GRADE_LABEL } from '@/lib/community/grades';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md: 맘스픽 커뮤니티는 로그인
// 사용자만 이용 가능하다.
// [개선사항8 - 미등업 유저 진입 플로우 개선](2026-09-04 todo.md): 로그인은 했지만 아직
// 새싹맘(첫 후기/체크리스트 1회) 조건을 못 채운 사용자도 피드 열람은 자유롭게
// 허용한다(전에는 "글쓰기"만 가능하고 피드는 막았다 — project/decision-log.md
// "등급 게이팅 범위"가 "로그인 사용자면 피드 열람 가능"이라고 이미 상위 결정해 둔
// 것과도 맞춘다). 새싹맘 등업 자체를 요구하는 시점은 챗봇 무제한 이용/글쓰기뿐이다.
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
// 없다 — SurveyReviewComposer가 글을 등록하면 다음 refreshProfile()에서 승급된 값을
// 그대로 받아온다.
// [Decision 020](2026-09-04): 글쓰기 화면을 기존 PostComposer(마이크로 리뷰/체크리스트
// 탭)에서 SurveyReviewComposer(설문형 스마트 리뷰 3단계 위저드)로 전면 교체한다 —
// spec/community/mom-pick-grades.md 3-4/3-5 개정 참고. post-composer.tsx는 더 이상
// 어디서도 쓰이지 않아 삭제한다(과거 데이터 자체는 mom_pick_posts에 그대로 남고,
// DashboardPostCard가 여전히 렌더링한다 — 지운 것은 "새 글을 쓰는 화면"일 뿐이다).
type DashboardData = { expert: DashboardPost[]; trending: DashboardPost[]; live: DashboardPost[] };

export function MomPickView() {
  // [등업 직후 게이팅 상태가 안 바뀌는 버그 수정](2026-09-13 사용자 지시): "글하나
  // 썼고 새싹맘 됐는데 글쓰기 버튼이나 다른 전체보기 등 누르면 아직 새싹맘 등급이
  // 아니에요 첫글 쓰러가기 나옴" — useMomPickAccess는 user가 바뀔 때만 프로필을
  // 다시 조회해 state(guest/not_sprout_yet/allowed)를 계산한다. 같은 세션에서
  // 첫 글을 써서 DB 트리거가 grade를 승급시켜도 user 자체는 그대로라 이 훅이
  // 재조회하지 않았다 — accessRefreshKey를 글 등록 직후 증가시켜 강제로
  // 재조회하게 한다(아래 refreshProfileAfterPost).
  const [accessRefreshKey, setAccessRefreshKey] = useState(0);
  const { state, profile: initialProfile } = useMomPickAccess(accessRefreshKey);
  const [profile, setProfile] = useState(initialProfile);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  // [todo.md 개선사항 10](2026-09-03): 비로그인 사용자가 "글쓰기"를 눌렀을 때만 여는
  // Soft-wall 모달 — 페이지 진입 즉시(state==='guest') 여는 게 아니라, 실제로 쓰려고
  // 시도하는 그 순간에만 연다는 점이 기존 LoginPromptModal 용례(진입 즉시 강제)와 다르다.
  const [isGuestWritePromptOpen, setIsGuestWritePromptOpen] = useState(false);
  // [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시,
  // Step 136/137): 메인 화면(헤더 + 피드)에는 글쓰기 폼을 두지 않고 상태 무관
  // 동일한 "✍️ 글쓰기" 버튼만 둔다. 실제로 쓰려는 액션이 확인되면
  // isFullScreenComposerOpen을 열어, 이 컴포넌트가 헤더/피드 없이 fixed inset-0
  // 전체 화면만 조기 반환(early return)한다 — 하단 탭(RootLayout이 항상 렌더)까지
  // 시각적으로 덮으면서, 배경 콘텐츠가 DOM에 남아있지 않아 진짜 "화면 전환"에
  // 가깝다(별도 /write 라우트를 새로 만들지 않고도).
  const [isFullScreenComposerOpen, setIsFullScreenComposerOpen] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  // [맘스픽 메인 화면 투명 오버레이 온보딩 패턴](2026-09-10 사용자 지시, todo.md
  // 개선사항4): "화면을 아예 숨기지 않고, 메인 화면을 보여주면서 유도" — 예전엔
  // not_sprout_yet 진입 즉시 안내 모달을 띄웠는데(배경 프리뷰를 가림), 이제는
  // 모달을 자동으로 띄우지 않고 피드를 프리뷰로 보여준 뒤, 피드를 터치하는 순간
  // 투명 인터셉트 레이어가 이를 가로채 안내 팝업을 띄운다(아래 렌더 참고).
  // 승급되면(state!=='not_sprout_yet') 조건에 더 이상 걸리지 않아 자동으로 닫힌다.
  useEffect(() => {
    if (state !== 'not_sprout_yet') setIsGuideModalOpen(false);
  }, [state]);

  // [todo.md 개선사항 10](2026-09-03): "맘스픽 메인 화면은 비로그인도 View-Only로 접근
  // 허용" — 이전에는 state==='allowed'일 때만 피드를 불러왔지만, 이제 게스트도 열람은
  // 가능해야 하므로 'guest'도 함께 허용한다.
  // [개선사항8 - 미등업 유저 진입 플로우 개선](2026-09-04 todo.md): "맘스픽 진입 시
  // 곧바로 강제로 후기 작성 화면으로 이동하는 로직을 폐지하고, 메인 화면(내 주변
  // 인기 스팟 등)이 먼저 정상적으로 로딩되어야 한다 — 등급 미달성 유저도 스팟 목록을
  // 스크롤하며 둘러보는 것은 자유롭게 허용." 기존에는 'not_sprout_yet'(로그인은 했지만
  // 첫 글을 아직 안 쓴 상태)일 때 이 조회 자체를 하지 않아 피드가 영원히 뜨지 않았다 —
  // 이제 함께 허용한다(project/decision-log.md "등급 게이팅 범위": 피드 열람 자체는
  // "로그인 사용자"면 가능하다는 상위 결정과도 일치 — 등급이 아니라 로그인 여부가
  // 기준이므로 스펙 충돌이 아니다).
  useEffect(() => {
    if (state !== 'allowed' && state !== 'guest' && state !== 'not_sprout_yet') return;
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
    // [등업 직후 게이팅 상태가 안 바뀌는 버그 수정](2026-09-13 사용자 지시): state
    // (guest/not_sprout_yet/allowed)를 계산하는 useMomPickAccess도 강제로
    // 재조회시킨다 — 안 그러면 글 등록 직후 grade가 sprout로 승급돼도 이 화면이
    // 계속 예전 state를 참조해 "첫 글 쓰러 가기" 안내가 다시 뜨는 문제가 있었다.
    setAccessRefreshKey((k) => k + 1);
    setProfile(await getMyProfile());
  }

  if (state === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  // [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
  // "글쓰기 화면으로 완전히 전환되어야해" — CSS(fixed 오버레이)로 배경을 덮기만
  // 하는 대신, 이 상태일 땐 아예 이 화면만 반환한다(헤더/피드/하단 탭과 동시에
  // DOM에 남아있지 않음 — 접근성과 "완전 전환"이라는 요구를 모두 충족).
  if (isFullScreenComposerOpen) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">✍️ 첫 글 쓰기</h2>
          <button
            type="button"
            onClick={() => setIsFullScreenComposerOpen(false)}
            aria-label="닫기"
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <SurveyReviewComposer
            onPosted={() => {
              setIsFullScreenComposerOpen(false);
              refreshProfileAfterPost();
            }}
          />
        </div>
      </div>
    );
  }

  // [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
  // "비로그인 유저는 로그인 인증화면으로 완전 전환되는거고" — 위 글쓰기 전환과
  // 동일한 이유로 조기 반환한다(LoginPromptModal 자체는 이미 fixed 전체 화면
  // 컴포넌트지만, 배경 헤더/피드가 DOM에 남아있지 않도록 여기서 반환한다).
  if (isGuestWritePromptOpen) {
    return <LoginPromptModal onClose={() => setIsGuestWritePromptOpen(false)} />;
  }

  // [맘스픽 화면은 맘스픽 컨텐츠만](2026-09-13 사용자 지시): "맘스픽 들어가면 어느
  // 스팟인가요? 장소 묻는거 뜨고 그아래 파워맘 우수맘 추천.. 뜨는데? 이럼 안되지..
  // 맘스픽화면은 맘스픽 컨텐츠만 나와야지 왜 글쓰기 도입부가 가장 위에 있어?" —
  // 바로 전 조치(2026-09-13 이전 커밋)에서 "새싹맘과 동일하게 보여야" 한다는
  // 요구를 글쓰기 폼(SurveyReviewComposer, 장소선택 1단계 포함)까지 그대로
  // 인라인 노출하는 것으로 구현했는데, 실제로는 그 폼 자체가 "맘스픽 컨텐츠"가
  // 아니라는 지적이다. 이제 메인 화면 상단엔 아무 글쓰기 진입점도 두지 않고
  // (아래 FAB 참고), 오직 피드(파워맘·우수맘 추천/인기·우수글/실시간 라이브)만
  // 남는다.
  function handleWriteClick() {
    if (state === 'guest') setIsGuestWritePromptOpen(true);
    else if (state === 'not_sprout_yet') setIsGuideModalOpen(true);
    else setIsFullScreenComposerOpen(true);
  }

  return (
    <div className="relative flex-1 flex flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">👑 맘스픽</h1>
        {profile && <span className="text-sm font-medium text-gray-600">{GRADE_LABEL[profile.grade]}</span>}
      </div>

      {state === 'allowed' && profile && <PersonalizedBanner birthYears={profile.birth_years} />}

      {/* [글쓰기 버튼을 우측 하단 플로팅으로](2026-09-13 사용자 지시): "글쓰기는
          맨 상단 말고 floating으로 해서 우측하단에 글쓰기 버튼으로" — 다른
          화면의 AI 챗봇 FAB(ai-chat-fab.tsx)와 동일한 위치/톤 관례를 따른다
          (제5장 제4조 기존 구조 우선). 버튼 자체는 상태와 무관하게 항상
          동일하다(로그인 여부를 드러내지 않는다는 원칙 유지). */}
      <button
        type="button"
        onClick={handleWriteClick}
        aria-label="글쓰기"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-2xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6"
      >
        ✍️
      </button>

      {(state === 'allowed' || state === 'guest' || state === 'not_sprout_yet') && (
        <div className="relative">
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

          {/* [투명 인터셉트 레이어](2026-09-10 사용자 지시, todo.md 개선사항4 /
              2026-09-11 확장): 비로그인(guest)·미등업(not_sprout_yet) 유저에게는
              피드가 배경으로 보이되(미리보기), 피드 위 콘텐츠/전체보기 링크/카드
              터치는 이 투명 버튼이 가로채 안내를 띄운다 — "누르는 것만 안되고,
              눌렀을 때 로그인/첫 글 작성으로 유도". PC에서 '전체보기'가 그냥
              눌려 들어가지던 문제를 이 레이어가 guest에도 적용되며 해결. 글쓰기
              영역(SurveyReviewComposer / 로그인 CTA 버튼)은 이 레이어 밖(위쪽)이라
              그대로 동작한다. */}
          {(state === 'guest' || state === 'not_sprout_yet') && (
            <button
              type="button"
              aria-label={
                state === 'guest'
                  ? '로그인하고 맘스픽 커뮤니티 이용하기'
                  : '첫 글을 작성하고 맘스픽 모든 기능 이용하기'
              }
              onClick={() =>
                state === 'guest' ? setIsGuestWritePromptOpen(true) : setIsGuideModalOpen(true)
              }
              className="absolute inset-0 z-10 w-full cursor-pointer bg-transparent"
            />
          )}
        </div>
      )}

      {isGuideModalOpen && (
        <SaessakMomGuideModal
          onWriteClick={() => {
            setIsGuideModalOpen(false);
            // [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자
            // 지시): "글쓰기 화면으로 완전히 전환되어야해" — 이전엔 같은 페이지 안
            // 폼을 드러내고 스크롤만 했지만(하단 탭이 계속 함께 보임), 이제
            // 하단 탭까지 덮는 완전한 화면 전환을 연다.
            setIsFullScreenComposerOpen(true);
          }}
          // [개선사항8 - 미등업 유저 진입 플로우 개선](2026-09-04 todo.md): "'X' 버튼을
          // 누르면 모달이 닫히며 다시 맘스픽 메인 화면으로 돌아가 탐색을 지속할 수
          // 있게 처리." 기존에는 닫기를 눌러도 '/'(홈)로 강제 이동시켜, 방금 바로 위에서
          // 허용한 피드 열람("메인 화면 우선 노출")을 실제로는 볼 수 없게 만드는
          // 모순이 있었다 — 그냥 모달만 닫아 같은 화면에서 계속 둘러볼 수 있게 한다.
          onClose={() => setIsGuideModalOpen(false)}
        />
      )}
    </div>
  );
}
