'use client';

// spec/common/search.md 2.2 탐색 범위 확장 방어 정책: 필터 미선택 상태에서 20km/30km 시도 시
// 서버 과부하 방지를 위해 노출하고, 확인 시 10km 범위로 조정을 유도한다.
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
          카테고리 또는 Quick 필터를 1개 이상 선택해야 20km/30km 광역 범위를 사용할 수 있습니다.
          10km 범위로 조정하시겠습니까?
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
