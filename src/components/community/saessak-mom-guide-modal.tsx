'use client';

// [새싹맘 등급 조건부 권한 제어 및 안내 팝업](2026-09-02 사용자 지시) Case 2(로그인 완료 +
// 새싹맘 미달성): "아직 새싹맘 등급이 아니에요!" 안내 모달. [첫 글 쓰러 가기]는 이 앱
// 구조상 별도 /write 페이지가 없다 — 글쓰기 폼(PostComposer)이 이미 같은 화면
// (/mom-pick)에 항상 노출돼 있으므로, 모달을 닫아 그 폼을 바로 보여주는 것으로
// 충분하다(제5장 제4조 기존 구조 우선 — 중복 페이지를 새로 만들지 않음).
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
