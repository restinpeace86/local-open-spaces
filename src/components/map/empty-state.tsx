'use client';

export function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
      <button
        type="button"
        onClick={onReset}
        className="rounded-full border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        필터 초기화
      </button>
    </div>
  );
}
