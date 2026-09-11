'use client';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시) Case 2(로그인 완료 +
// 새싹맘 미달성): "아직 새싹맘 등급이 아니에요!" 안내 모달. [첫 글 쓰러 가기]는 이 앱
// 구조상 별도 /write 페이지가 없다 — 글쓰기 폼(SurveyReviewComposer, 2026-09-04
// Decision 020으로 PostComposer를 대체)이 같은 화면(/mom-pick)에 있으므로, 모달을
// 닫으며 그 폼을 그 자리에서 드러내는(reveal) 것으로 충분하다(제5장 제4조 기존
// 구조 우선 — 중복 페이지를 새로 만들지 않음).
//
// [맘스픽 첫 글쓰기 소프트월 통일](2026-09-12 사용자 지시): "첫글은 안 쓴 상태면 맘스픽
// 내용만 보여야지, 첫글쓰기의 장소선택이 같이 보이면 안 된다" — 이전에는 이 폼이
// 항상 화면에 떠 있어 [첫 글 쓰러 가기]가 단순히 스크롤만 했지만, 이제는 이 모달을
// 거쳐야만(mom-pick-view.tsx의 isComposerRevealed) 폼 자체가 렌더링된다.
export function SaessakMomGuideModal({ onWriteClick, onClose }: { onWriteClick: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-5 shadow-xl md:w-[380px] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-900">🌱 아직 새싹맘 등급이 아니에요!</h2>
        <p className="mt-2 text-sm text-gray-500">
          동네 핫플이나 정보를 하나 공유하고 맘스픽의 모든 기능을 이용해보세요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onWriteClick}
            className="rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            첫 글 쓰러 가기
          </button>
          <button type="button" onClick={onClose} className="py-1.5 text-center text-sm text-gray-400 hover:text-gray-600">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
