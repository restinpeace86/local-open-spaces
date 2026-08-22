'use client';

import { MiniMap } from '@/components/map/mini-map';

// Task 9-5-1(2026-08-22): 미니맵의 "🔍 크게보기" 버튼이 여는 풀스크린 지도 모달.
export function MapPreviewModal({
  lat,
  lng,
  name,
  onClose,
}: {
  lat: number;
  lng: number;
  name: string;
  onClose: () => void;
}) {
  return (
    // DetailModal 위에 겹쳐 렌더링되므로(같은 DOM 트리 안), 여기서 클릭 이벤트가 계속
    // 버블링되면 하단 DetailModal의 onClick={onClose}까지 같이 실행돼 둘 다 닫혀버린다.
    // stopPropagation으로 이 모달 선에서 이벤트를 끊는다.
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative w-full h-full md:w-[90vw] md:h-[85vh] md:rounded-2xl overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="지도 닫기"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-600 hover:text-gray-900"
        >
          ✕
        </button>
        <MiniMap lat={lat} lng={lng} name={name} interactive className="w-full h-full" />
      </div>
    </div>
  );
}
