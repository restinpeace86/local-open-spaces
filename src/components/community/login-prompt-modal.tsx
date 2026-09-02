'use client';

import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시) Case 1(비로그인):
// "맘스픽" 진입 시 로그인/회원가입 유도 모달.
export function LoginPromptModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-5 shadow-xl md:w-[380px] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-900">👑 맘스픽은 로그인 후 이용할 수 있어요</h2>
        <p className="mt-2 text-sm text-gray-500">
          로그인하면 다른 엄마들의 생생한 후기와 체크리스트를 보고, 직접 글도 남길 수 있어요.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <KakaoLoginButton />
          <GoogleLoginButton />
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full text-center text-sm text-gray-400 hover:text-gray-600">
          닫기
        </button>
      </div>
    </div>
  );
}
