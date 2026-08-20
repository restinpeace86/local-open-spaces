'use client';

// spec/common/search.md 2.2: 기본 1km/5km/10km(기본값 5km) + 카테고리/Quick 필터 활성화 시 해금되는 20km/30km 광역 옵션
const RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '20km', value: 20000 },
  { label: '30km', value: 30000 },
];

const WIDE_RADIUS_VALUES = [20000, 30000];

export function RadiusSelector({
  value,
  onChange,
  isWideRadiusUnlocked,
  onBlockedWideRadiusSelect,
}: {
  value: number;
  onChange: (radius: number) => void;
  isWideRadiusUnlocked: boolean;
  onBlockedWideRadiusSelect: () => void;
}) {
  return (
    <div className="flex gap-1.5">
      {RADIUS_OPTIONS.map((opt) => {
        const isWideOption = WIDE_RADIUS_VALUES.includes(opt.value);
        const isLocked = isWideOption && !isWideRadiusUnlocked;

        return (
          <button
            key={opt.value}
            type="button"
            aria-disabled={isLocked}
            onClick={() => (isLocked ? onBlockedWideRadiusSelect() : onChange(opt.value))}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              value === opt.value
                ? 'bg-blue-600 text-white'
                : isLocked
                  ? 'bg-white text-gray-400 border border-gray-200'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
