'use client';

import { MiniMap } from '@/components/map/mini-map';
import { useModalBackClose } from '@/hooks/use-modal-back-close';

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
  // Task 9-6-17: DetailModal 위에 겹쳐 열리는 레이어이므로 자체 히스토리 state를 하나 더
  // 쌓는다 — 뒤로가기 1회는 이 모달만 닫고(DetailModal은 유지), 그다음 뒤로가기에서
  // DetailModal이 닫히도록 레이어별로 독립 처리한다.
  useModalBackClose(onClose);

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
