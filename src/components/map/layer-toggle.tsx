'use client';

// spec/map/spatial-search.md 2.2: 상시 시설(open_spaces)은 기본 비활성화, 토글로 활성화
export function LayerToggle({
  showSpaces,
  onChange,
}: {
  showSpaces: boolean;
  onChange: (show: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!showSpaces)}
      className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
        showSpaces
          ? 'bg-emerald-600 text-white border-emerald-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {showSpaces ? '상시 시설 보임' : '상시 시설 보기'}
    </button>
  );
}
