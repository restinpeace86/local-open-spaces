'use client';

// implementation/todo.md Phase 2: 위치 확정 시 헤더에 동네 이름 표시, 클릭 시 재설정 가능
export function LocationHeader({
  addressName,
  onClick,
}: {
  addressName: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start flex items-center gap-1.5 rounded-full bg-white border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
    >
      <span aria-hidden>📍</span>
      <span>{addressName ?? '내 동네 설정하기'}</span>
      <span aria-hidden className="text-gray-400">▾</span>
    </button>
  );
}
