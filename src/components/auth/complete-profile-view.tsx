'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/use-user';
import { getMyProfile, updateBirthYears, updateNickname } from '@/lib/auth/profile';

const MAX_NICKNAME_LENGTH = 20;
const CURRENT_YEAR = new Date().getFullYear();

// [구글/카카오 인증 후 필수 프로필 입력](2026-09-04 사용자 지시): "인증되면 바로
// 회원가입폼으로 가서 닉네임, 아이 연령을 기본으로 받게 해줘 — 나중에 마이페이지에서
// 입력하는 게 아니고." 기존에는 이 두 값(nickname/birth_years)을 /my 마이페이지에서
// 로그인 후 원할 때(또는 영원히 안) 채워 넣는 선택적 입력이었다(NicknameEditor/
// BirthYearsEditor, 2026-09-02) — 이 화면은 그 두 컴포넌트가 쓰던 것과 동일한 저장
// 함수(updateNickname/updateBirthYears)를 재사용하되(제5장 제4조 기존 구조 우선),
// "둘 다 채우지 않으면 다음으로 넘어갈 수 없는" 하나의 필수 폼으로 합친다. 이미 한쪽만
// 채워져 있는 경우(예: 닉네임만 있고 아이 정보가 없음)를 덮어쓰지 않도록, 진입 시
// 기존 값을 먼저 불러와 채워둔다.
//
// 진입 경로는 두 가지다: ① `auth/callback/route.ts`가 최초 로그인 직후 프로필이
// 비어있으면 이 화면으로 보낸다. ② `ProfileCompletionGuard`가 이미 로그인했지만
// 아직 완료하지 않은 사용자가 다른 화면으로 이동하려 할 때마다 이 화면으로 되돌린다
// (둘 중 하나만 있으면 폼을 닫고 나가버린 사용자가 "마이페이지에서 나중에" 상태로
// 영원히 남을 수 있어 둘 다 필요하다).
export function CompleteProfileView() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/my';

  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  const [birthYears, setBirthYears] = useState<number[]>([CURRENT_YEAR]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      router.replace('/'); // 로그인 없이 이 화면에 올 이유가 없다(직접 URL 접근 등 방어).
      return;
    }
    let cancelled = false;
    getMyProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile?.nickname) setNickname(profile.nickname);
        if (profile?.birth_years && profile.birth_years.length > 0) setBirthYears(profile.birth_years);
      })
      .catch(() => {
        // 조회 실패해도 빈 폼으로 그대로 입력을 받을 수 있게 둔다(제5장 제11조 —
        // 서비스가 중단되지 않아야 한다).
      })
      .finally(() => {
        if (!cancelled) setIsProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isUserLoading, user, router]);

  function handleChangeYear(index: number, value: string) {
    const year = Number(value);
    setBirthYears((prev) => prev.map((y, i) => (i === index ? year : y)));
  }

  function handleAddChild() {
    setBirthYears((prev) => [...prev, CURRENT_YEAR]);
  }

  function handleRemoveChild(index: number) {
    // 최소 1명은 남겨둔다 — 전부 지우면 "필수" 요건과 모순된다.
    setBirthYears((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setErrorMessage('닉네임을 입력해주세요.');
      return;
    }
    const validYears = birthYears.filter((y) => Number.isFinite(y) && y >= 1900 && y <= CURRENT_YEAR);
    if (validYears.length === 0) {
      setErrorMessage('아이 출생년도를 최소 1명 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateNickname(trimmedNickname);
      await updateBirthYears(validYears);
      router.replace(next);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isUserLoading || !user || isProfileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-5">
      <h1 className="mb-1 text-lg font-bold text-gray-900">환영해요! 프로필을 완성해주세요</h1>
      <p className="mb-5 text-sm text-gray-500">
        닉네임과 아이 출생년도를 알려주시면 연령에 맞는 나들이를 추천해드려요.
      </p>

      {/* noValidate: 아이 출생년도 input의 min/max(1900~올해)가 브라우저 네이티브
          제약 검증과 겹치면, 범위를 벗어난 값을 입력했을 때 폼 제출 자체가 (내 커스텀
          에러 문구 대신) 브라우저 기본 팝업으로 막혀버린다 — 검증은 전부 아래
          handleSubmit의 JS 로직 하나로만 판단하도록 통일한다. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="complete-profile-nickname">
            닉네임
          </label>
          <input
            id="complete-profile-nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, MAX_NICKNAME_LENGTH))}
            placeholder="예: 민지맘"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">아이 출생년도</span>
          <p className="text-xs text-gray-400">아이가 여러 명이면 출생년도를 각각 추가해주세요.</p>
          {birthYears.map((year, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={year}
                onChange={(e) => handleChangeYear(i, e.target.value)}
                min={1900}
                max={CURRENT_YEAR}
                placeholder="예: 2022"
                className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <span className="text-xs text-gray-400">년생</span>
              {birthYears.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveChild(i)}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={handleAddChild} className="self-start text-xs text-blue-600 hover:underline">
            + 아이 추가
          </button>
        </div>

        {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '시작하기'}
        </button>
      </form>
    </div>
  );
}
