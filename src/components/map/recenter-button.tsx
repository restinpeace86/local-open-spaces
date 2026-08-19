'use client';

// implementation/todo.md: 지도 드래그 후 '이 위치에서 재검색' Floating 버튼
export function RecenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-white border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 shadow-lg hover:bg-gray-50"
    >
      <span aria-hidden>🔄</span>
      <span>이 위치에서 재검색</span>
    </button>
  );
}
