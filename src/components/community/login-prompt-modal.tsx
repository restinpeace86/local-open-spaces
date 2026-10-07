'use client';

import { KakaoLoginButton } from '@/components/auth/kakao-login-button';
import { GoogleLoginButton } from '@/components/auth/google-login-button';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시) Case 1(비로그인):
// "맘스픽" 진입 시 로그인/회원가입 유도.
// [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
// "여기서 뭔가 누르려고 하면 그때 비로그인 유저는 로그인 인증화면으로 완전
// 전환되는거고.." — 이전엔 배경이 반투명하게 비치는 하단 시트 모달이라 뒤의
// 맘스픽 화면(과 하단 탭)이 그대로 함께 보였다. 별도 라우트 없이도 "완전
// 전환"처럼 보이도록 배경을 불투명(bg-white)으로, 영역을 전체 화면(fixed
// inset-0)으로 바꿨다 — RootLayout이 하단 탭을 항상 렌더하지만 이 오버레이가
// 그 영역까지 전부 덮는다.
// [문화센터 열람 권한](2026-10-08 사용자 지시): 다른 기능(문화센터 등)에서도
// 동일한 전체화면 로그인 유도를 재사용할 수 있도록 title/description을 선택적
// override로 받는다 — 생략 시 기존 맘스픽 문구 그대로(제5장 제4조 기존 구조
// 우선, 기존 호출부 동작 변화 없음).
export function LoginPromptModal({
  onClose,
  title = '👑 맘스픽은 로그인 후 이용할 수 있어요',
  description = '로그인하면 다른 엄마들의 생생한 후기와 체크리스트를 보고, 직접 글도 남길 수 있어요.',
}: {
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-end px-5 py-4">
        <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-5 text-center">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
        <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
          <KakaoLoginButton />
          <GoogleLoginButton />
        </div>
      </div>
    </div>
  );
}
