'use client';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시) Case 2(로그인 완료 +
// 새싹맘 미달성): "아직 새싹맘 등급이 아니에요!" 안내 모달(작은 카드, 그대로 유지).
//
// [맘스픽 메인 화면 항상 동일하게 노출 + 진짜 화면 전환](2026-09-13 사용자 지시):
// "글쓰기 화면으로 완전히 전환되어야해" — [첫 글 쓰러 가기]를 누르면 mom-pick-view.tsx가
// 이 안내 모달을 닫고 하단 탭까지 덮는 전체 화면 글쓰기(SurveyReviewComposer)로
// 전환한다(별도 /write 라우트를 새로 만들지 않고, 같은 화면 안의 fixed 오버레이로
// 구현 — 제5장 제4조 기존 구조 우선).
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
