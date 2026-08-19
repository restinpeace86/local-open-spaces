'use client';

// spec/common/search.md 2.2: 10km 초과 광역 탐색 시도 시 시/구 단위 그리드 뷰 전환 안내
export function GridViewPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5">
        <p className="text-sm text-gray-900 leading-relaxed">
          10km를 초과하는 광역 범위는 단일 지도 반경으로 제공되지 않으며, 시/구 단위 그리드(District
          Grid) 뷰로 전환하시겠습니까?
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2.5 hover:bg-gray-50"
          >
            아니오
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700"
          >
            예
          </button>
        </div>
      </div>
    </div>
  );
}
