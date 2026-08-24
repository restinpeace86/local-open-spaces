'use client';

// Task 9-6-10(2026-08-23): 지도 드래그/재검색으로 탐색 기준점이 실제 설정 위치에서 벗어나
// 있어도 원터치로 되돌리는 Floating 버튼. RecenterButton("이 위치에서 재검색")과 스타일을
// 맞추되, 항상 떠 있는 원형 아이콘 버튼(recenter-button.tsx는 pendingRecenter가 있을 때만
// 노출되는 조건부 버튼)이라 지도 우하단에 독립적으로 배치한다.
export function MyLocationButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="내 위치/설정위치로 이동"
      title="내 위치/설정위치로 이동"
      className="flex items-center justify-center w-11 h-11 rounded-full bg-white border border-gray-300 text-lg shadow-lg hover:bg-gray-50"
    >
      <span aria-hidden>🎯</span>
    </button>
  );
}
