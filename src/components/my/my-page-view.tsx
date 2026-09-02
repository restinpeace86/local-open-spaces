'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { BirthYearsEditor } from '@/components/auth/birth-years-editor';
import { getMyProfile, Profile } from '@/lib/auth/profile';

// [Decision 018](2026-09-02) / spec/common/auth-user-profile.md: 로그인 전에는 카카오/구글
// 로그인 버튼을, 로그인 후에는 프로필(자녀 출생년도) 편집 화면을 보여준다. "찜"/"방문
// 이력"은 Spec이 RLS 근거로만 언급했을 뿐 화면/데이터 구조가 정의돼 있지 않아(제3장
// 제4조 추측 금지) 이번 범위에 포함하지 않는다.
export function MyPageView() {
  const { user, isLoading: isUserLoading } = useUser();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.get('auth_error') ? '로그인 중 문제가 발생했어요. 다시 시도해주세요.' : null
  );

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
      .catch((err) => {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : '프로필 조회에 실패했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (isUserLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-5">
      <h1 className="mb-4 text-lg font-bold text-gray-900">마이</h1>

      {errorMessage && <p className="mb-3 text-xs text-red-600">{errorMessage}</p>}

      {!user ? (
        <div className="flex flex-col gap-3">
          <p className="mb-1 text-sm text-gray-500">로그인하면 자녀 정보에 맞는 맞춤 추천을 받을 수 있어요.</p>
          <KakaoLoginButton onError={setErrorMessage} />
          <GoogleLoginButton onError={setErrorMessage} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700 truncate">{user.email ?? user.id}</p>
            <SignOutButton />
          </div>
          {isProfileLoading ? (
            <p className="text-xs text-gray-400">프로필 불러오는 중...</p>
          ) : (
            // [실측으로 발견한 버그] BirthYearsEditor는 initialBirthYears를 useState의
            // 초기값으로만 쓴다 — profile이 아직 null인 첫 렌더에서 빈 배열로 한 번
            // 마운트된 뒤, isProfileLoading=true 구간이 React 배치 처리로 인해 별도
            // 커밋 없이 지나가버리면(빠르게 응답하는 네트워크에서 실제로 재현됨)
            // BirthYearsEditor가 리마운트되지 않아 실제 데이터가 와도 빈 배열에 영원히
            // 머문다. profile 존재 여부로 key를 줘서 profile이 채워지는 순간 확실히
            // 리마운트되게 한다.
            <BirthYearsEditor key={profile ? 'loaded' : 'pending'} initialBirthYears={profile?.birth_years ?? []} />
          )}
        </div>
      )}
    </div>
  );
}
