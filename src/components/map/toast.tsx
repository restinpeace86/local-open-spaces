'use client';

// spec/map/spatial-search.md 3.1: 반경 내 200개 초과 시 하단 토스트 안내
export function Toast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="pointer-events-auto rounded-full bg-gray-900/90 text-white text-sm px-4 py-2 shadow-lg">
        {message}
      </div>
    </div>
  );
}
