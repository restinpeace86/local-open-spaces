'use client';

// spec/common/search.md 2.2, spec/map/spatial-search.md 2.1: 1km/5km/10km, 기본값 5km
const RADIUS_OPTIONS = [
  { label: '1km', value: 1000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
];

export function RadiusSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (radius: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {RADIUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
